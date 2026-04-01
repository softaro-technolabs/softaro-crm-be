import { randomUUID } from 'crypto';

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import {
  leadPropertyInterests,
  leads,
  propertyAttributeValues,
  propertyAttributes,
  propertyEntities,
  propertyLocations,
  propertyMedia,
  propertyPricingBreakups,
  propertyStatusLogs,
  propertyUnits,
  users
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';

import type {
  CreateLeadPropertyInterestDto,
  CreatePropertyAttributeDto,
  CreatePropertyEntityDto,
  CreatePropertyMediaDto,
  CreatePropertyUnitDto,
  LeadPropertyInterestListQueryDto,
  PropertyAttributeListQueryDto,
  PropertyEntityListQueryDto,
  PropertyUnitListQueryDto,
  ReplacePricingBreakupsDto,
  UpdateLeadPropertyInterestDto,
  UpdatePropertyAttributeDto,
  UpdatePropertyEntityDto,
  UpdatePropertyMediaDto,
  UpdatePropertyUnitDto,
  UpdatePropertyUnitStatusDto,
  UpsertAttributeValuesDto,
  UpsertPropertyLocationDto
} from './properties.dto';

@Injectable()
export class PropertiesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) { }

  async listEntities(tenantId: string, query: PropertyEntityListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [eq(propertyEntities.tenantId, tenantId)];
    if (query.entityType) baseFilters.push(eq(propertyEntities.entityType, query.entityType));
    if (query.status) baseFilters.push(eq(propertyEntities.status, query.status));
    if (query.parentId) baseFilters.push(eq(propertyEntities.parentId, query.parentId));
    if (query.rootOnly) baseFilters.push(isNull(propertyEntities.parentId));

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [propertyEntities.name],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) {
      allFilters.push(searchFilter);
    }

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      name: propertyEntities.name,
      createdAt: propertyEntities.createdAt,
      updatedAt: propertyEntities.updatedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      propertyEntities.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(propertyEntities)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(propertyEntities).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }
  async getEntity(tenantId: string, entityId: string) {
    const [row] = await this.db
      .select({
        entity: propertyEntities,
        location: propertyLocations,
        createdBy: {
          id: users.id,
          name: users.name
        }
      })
      .from(propertyEntities)
      .leftJoin(propertyLocations, and(eq(propertyLocations.entityId, propertyEntities.id), eq(propertyLocations.tenantId, tenantId)))
      .leftJoin(users, eq(propertyEntities.createdByUserId, users.id))
      .where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.id, entityId)))
      .limit(1);

    if (!row) throw new NotFoundException('Property entity not found');

    const [attributes, media, parentRow] = await Promise.all([
      this.listEntityAttributeValues(tenantId, entityId),
      this.listMedia(tenantId, { entityId }),
      row.entity.parentId
        ? this.db
          .select({ id: propertyEntities.id, name: propertyEntities.name })
          .from(propertyEntities)
          .where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.id, row.entity.parentId)))
          .limit(1)
          .then((res) => res[0] || null)
        : Promise.resolve(null)
    ]);

    return { ...row, attributes, media, parent: parentRow };
  }

  async createEntity(tenantId: string, dto: CreatePropertyEntityDto, options?: { createdByUserId?: string | null }) {
    if (dto.parentId) {
      await this.ensureEntityExists(tenantId, dto.parentId);
    }

    // Validate attributes if present
    if (dto.attributes && dto.attributes.length > 0) {
      const attributeIds = Array.from(new Set(dto.attributes.map((v) => v.attributeId)));
      const attrs = await this.db
        .select()
        .from(propertyAttributes)
        .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.scope, 'entity')));
      const allowed = new Map(attrs.map((a) => [a.id, a]));
      for (const id of attributeIds) {
        if (!allowed.has(id)) throw new BadRequestException('One or more attributes are invalid for entity scope');
      }
    }

    const id = randomUUID();
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(propertyEntities).values({
        id,
        tenantId,
        parentId: dto.parentId ?? null,
        entityType: dto.entityType,
        name: dto.name,
        status: dto.status ?? 'active',
        description: dto.description ?? null,
        createdByUserId: options?.createdByUserId ?? null,
        createdAt: now,
        updatedAt: now
      });

      if (dto.location) {
        await tx.insert(propertyLocations).values({
          id: randomUUID(),
          tenantId,
          entityId: id,
          addressLine: dto.location.addressLine ?? null,
          area: dto.location.area ?? null,
          city: dto.location.city ?? null,
          state: dto.location.state ?? null,
          country: dto.location.country ?? null,
          pincode: dto.location.pincode ?? null,
          latitude: dto.location.latitude !== undefined ? dto.location.latitude.toString() : null,
          longitude: dto.location.longitude !== undefined ? dto.location.longitude.toString() : null
        });
      }

      if (dto.attributes && dto.attributes.length > 0) {
        for (const item of dto.attributes) {
          if (item.value !== null && item.value !== undefined) {
            await tx.insert(propertyAttributeValues).values({
              id: randomUUID(),
              tenantId,
              attributeId: item.attributeId,
              entityId: id,
              unitId: null,
              value: item.value
            });
          }
        }
      }

      if (dto.media && dto.media.length > 0) {
        for (const item of dto.media) {
          await tx.insert(propertyMedia).values({
            id: randomUUID(),
            tenantId,
            entityId: id,
            unitId: null, // Media on creation is always for the entity
            mediaType: item.mediaType,
            fileUrl: item.fileUrl,
            isPublic: item.isPublic ?? false,
            sortOrder: item.sortOrder ?? 0,
            createdAt: now
          });
        }
      }
    });
    return this.getEntity(tenantId, id);
  }

  async updateEntity(tenantId: string, entityId: string, dto: UpdatePropertyEntityDto) {
    await this.ensureEntityExists(tenantId, entityId);

    if (dto.parentId !== undefined) {
      if (dto.parentId === entityId) {
        throw new BadRequestException('Entity cannot be its own parent');
      }
      if (dto.parentId) {
        await this.ensureEntityExists(tenantId, dto.parentId);
      }
    }

    const updateData: Partial<typeof propertyEntities.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.description !== undefined) updateData.description = dto.description ?? null;
    if (dto.parentId !== undefined) updateData.parentId = dto.parentId ?? null;

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date();
      await this.db.update(propertyEntities).set(updateData).where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.id, entityId)));
    }

    if (dto.location) {
      await this.upsertEntityLocation(tenantId, entityId, dto.location);
    }

    if (dto.attributes && dto.attributes.length > 0) {
      await this.upsertEntityAttributeValues(tenantId, entityId, { values: dto.attributes });
    }

    if (dto.media && dto.media.length > 0) {
      for (const item of dto.media) {
        if (item.id) {
          // Update existing media (Only metadata, not fileUrl usually, but allowing fileUrl for flexibility)
          const mediaUpdate: any = {};
          if (item.mediaType) mediaUpdate.mediaType = item.mediaType;
          if (item.fileUrl) mediaUpdate.fileUrl = item.fileUrl;
          if (item.isPublic !== undefined) mediaUpdate.isPublic = item.isPublic;
          if (item.sortOrder !== undefined) mediaUpdate.sortOrder = item.sortOrder;

          if (Object.keys(mediaUpdate).length > 0) {
            await this.db.update(propertyMedia)
              .set(mediaUpdate)
              .where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.id, item.id), eq(propertyMedia.entityId, entityId)));
          }
        } else {
          // Create new media
          if (!item.mediaType || !item.fileUrl) continue; // Skip invalid new items
          await this.db.insert(propertyMedia).values({
            id: randomUUID(),
            tenantId,
            entityId,
            unitId: null,
            mediaType: item.mediaType,
            fileUrl: item.fileUrl,
            isPublic: item.isPublic ?? false,
            sortOrder: item.sortOrder ?? 0,
            createdAt: new Date()
          });
        }
      }
    }

    return this.getEntity(tenantId, entityId);
  }

  async deleteEntity(tenantId: string, entityId: string) {
    await this.ensureEntityExists(tenantId, entityId);

    const [child] = await this.db
      .select({ id: propertyEntities.id })
      .from(propertyEntities)
      .where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.parentId, entityId)))
      .limit(1);
    if (child) {
      throw new BadRequestException('Cannot delete entity with child entities');
    }

    const [unit] = await this.db
      .select({ id: propertyUnits.id })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.entityId, entityId)))
      .limit(1);
    if (unit) {
      throw new BadRequestException('Cannot delete entity with units. Delete units first.');
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(propertyLocations).where(and(eq(propertyLocations.tenantId, tenantId), eq(propertyLocations.entityId, entityId)));
      await tx.delete(propertyAttributeValues).where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.entityId, entityId)));
      await tx.delete(propertyMedia).where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.entityId, entityId)));
      await tx.delete(propertyEntities).where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.id, entityId)));
    });
  }

  async getEntityLocation(tenantId: string, entityId: string) {
    await this.ensureEntityExists(tenantId, entityId);
    const [loc] = await this.db
      .select()
      .from(propertyLocations)
      .where(and(eq(propertyLocations.tenantId, tenantId), eq(propertyLocations.entityId, entityId)))
      .limit(1);
    return loc ?? null;
  }

  async upsertEntityLocation(tenantId: string, entityId: string, dto: UpsertPropertyLocationDto) {
    await this.ensureEntityExists(tenantId, entityId);
    const existing = await this.getEntityLocation(tenantId, entityId);

    const data: Partial<typeof propertyLocations.$inferInsert> = {
      addressLine: dto.addressLine ?? null,
      area: dto.area ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      country: dto.country ?? null,
      pincode: dto.pincode ?? null,
      latitude: dto.latitude !== undefined ? dto.latitude.toString() : null,
      longitude: dto.longitude !== undefined ? dto.longitude.toString() : null
    };

    if (!existing) {
      const id = randomUUID();
      await this.db.insert(propertyLocations).values({
        id,
        tenantId,
        entityId,
        ...data
      });
      return this.getEntityLocation(tenantId, entityId);
    }

    await this.db
      .update(propertyLocations)
      .set(data)
      .where(and(eq(propertyLocations.tenantId, tenantId), eq(propertyLocations.entityId, entityId)));

    return this.getEntityLocation(tenantId, entityId);
  }

  async listUnits(tenantId: string, query: PropertyUnitListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [eq(propertyUnits.tenantId, tenantId)];
    if (query.entityId) baseFilters.push(eq(propertyUnits.entityId, query.entityId));
    if (query.unitStatus) baseFilters.push(eq(propertyUnits.unitStatus, query.unitStatus));

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [propertyUnits.unitCode],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) {
      allFilters.push(searchFilter);
    }

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      unitCode: propertyUnits.unitCode,
      price: propertyUnits.price,
      pricePerSqft: propertyUnits.pricePerSqft,
      createdAt: propertyUnits.createdAt,
      updatedAt: propertyUnits.updatedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      propertyUnits.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          unit: propertyUnits,
          entity: {
            id: propertyEntities.id,
            name: propertyEntities.name,
            entityType: propertyEntities.entityType
          }
        })
        .from(propertyUnits)
        .innerJoin(propertyEntities, and(eq(propertyEntities.id, propertyUnits.entityId), eq(propertyEntities.tenantId, tenantId)))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(propertyUnits).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getUnit(tenantId: string, unitId: string) {
    const [row] = await this.db
      .select({
        unit: propertyUnits,
        entity: propertyEntities
      })
      .from(propertyUnits)
      .innerJoin(propertyEntities, and(eq(propertyEntities.id, propertyUnits.entityId), eq(propertyEntities.tenantId, tenantId)))
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)))
      .limit(1);
    if (!row) throw new NotFoundException('Property unit not found');
    return row;
  }

  async createUnit(tenantId: string, dto: CreatePropertyUnitDto) {
    await this.ensureEntityExists(tenantId, dto.entityId);
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(propertyUnits).values({
      id,
      tenantId,
      entityId: dto.entityId,
      unitCode: dto.unitCode,
      price: dto.price !== undefined ? dto.price.toString() : null,
      pricePerSqft: dto.pricePerSqft !== undefined ? dto.pricePerSqft.toString() : null,
      unitStatus: dto.unitStatus ?? 'available',
      createdAt: now,
      updatedAt: now
    });

    return this.getUnit(tenantId, id);
  }

  async updateUnit(tenantId: string, unitId: string, dto: UpdatePropertyUnitDto) {
    await this.ensureUnitExists(tenantId, unitId);

    const updateData: Partial<typeof propertyUnits.$inferInsert> = {};
    if (dto.unitCode !== undefined) updateData.unitCode = dto.unitCode;
    if (dto.price !== undefined) updateData.price = dto.price !== null ? dto.price.toString() : null;
    if (dto.pricePerSqft !== undefined) updateData.pricePerSqft = dto.pricePerSqft !== null ? dto.pricePerSqft.toString() : null;
    if (dto.unitStatus !== undefined) updateData.unitStatus = dto.unitStatus;

    if (Object.keys(updateData).length === 0) {
      return this.getUnit(tenantId, unitId);
    }

    updateData.updatedAt = new Date();
    await this.db.update(propertyUnits).set(updateData).where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)));
    return this.getUnit(tenantId, unitId);
  }

  async changeUnitStatus(tenantId: string, unitId: string, dto: UpdatePropertyUnitStatusDto, options?: { changedByUserId?: string | null }) {
    const unit = await this.ensureUnitExists(tenantId, unitId);
    const oldStatus = unit.unitStatus;
    const now = new Date();

    if (oldStatus === dto.newStatus) {
      return this.getUnit(tenantId, unitId);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(propertyUnits)
        .set({ unitStatus: dto.newStatus, updatedAt: now })
        .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)));

      await tx.insert(propertyStatusLogs).values({
        id: randomUUID(),
        tenantId,
        unitId,
        oldStatus,
        newStatus: dto.newStatus,
        changedByUserId: options?.changedByUserId ?? null,
        changedAt: now,
        remarks: dto.remarks ?? null
      });
    });

    return this.getUnit(tenantId, unitId);
  }

  async listUnitStatusLogs(tenantId: string, unitId: string) {
    await this.ensureUnitExists(tenantId, unitId);
    return this.db
      .select()
      .from(propertyStatusLogs)
      .where(and(eq(propertyStatusLogs.tenantId, tenantId), eq(propertyStatusLogs.unitId, unitId)))
      .orderBy(desc(propertyStatusLogs.changedAt));
  }

  async deleteUnit(tenantId: string, unitId: string) {
    await this.ensureUnitExists(tenantId, unitId);
    await this.db.transaction(async (tx) => {
      await tx.delete(leadPropertyInterests).where(and(eq(leadPropertyInterests.tenantId, tenantId), eq(leadPropertyInterests.unitId, unitId)));
      await tx.delete(propertyPricingBreakups).where(and(eq(propertyPricingBreakups.tenantId, tenantId), eq(propertyPricingBreakups.unitId, unitId)));
      await tx.delete(propertyAttributeValues).where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.unitId, unitId)));
      await tx.delete(propertyMedia).where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.unitId, unitId)));
      await tx.delete(propertyStatusLogs).where(and(eq(propertyStatusLogs.tenantId, tenantId), eq(propertyStatusLogs.unitId, unitId)));
      await tx.delete(propertyUnits).where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)));
    });
  }

  async listAttributes(tenantId: string, query: PropertyAttributeListQueryDto) {
    const filters: SQL[] = [eq(propertyAttributes.tenantId, tenantId)];
    if (query.scope) filters.push(eq(propertyAttributes.scope, query.scope));
    let whereClause = filters[0];
    for (let i = 1; i < filters.length; i += 1) whereClause = and(whereClause, filters[i]) as SQL;
    return this.db.select().from(propertyAttributes).where(whereClause).orderBy(propertyAttributes.name);
  }

  async createAttribute(tenantId: string, dto: CreatePropertyAttributeDto) {
    const [existing] = await this.db
      .select({ id: propertyAttributes.id })
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.name, dto.name)))
      .limit(1);
    if (existing) throw new BadRequestException('Attribute name already exists in this tenant');

    const id = randomUUID();
    await this.db.insert(propertyAttributes).values({
      id,
      tenantId,
      name: dto.name,
      dataType: dto.dataType,
      scope: dto.scope
    });

    return this.getAttribute(tenantId, id);
  }

  async getAttribute(tenantId: string, attributeId: string) {
    const [attr] = await this.db
      .select()
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.id, attributeId)))
      .limit(1);
    if (!attr) throw new NotFoundException('Attribute not found');
    return attr;
  }

  async updateAttribute(tenantId: string, attributeId: string, dto: UpdatePropertyAttributeDto) {
    await this.getAttribute(tenantId, attributeId);

    const [hasValues] = await this.db
      .select({ id: propertyAttributeValues.id })
      .from(propertyAttributeValues)
      .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.attributeId, attributeId)))
      .limit(1);

    if (hasValues && (dto.dataType !== undefined || dto.scope !== undefined)) {
      throw new BadRequestException('Cannot change attribute dataType/scope when values exist');
    }

    const updateData: Partial<typeof propertyAttributes.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.dataType !== undefined) updateData.dataType = dto.dataType;
    if (dto.scope !== undefined) updateData.scope = dto.scope;

    if (Object.keys(updateData).length === 0) {
      return this.getAttribute(tenantId, attributeId);
    }

    await this.db
      .update(propertyAttributes)
      .set(updateData)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.id, attributeId)));

    return this.getAttribute(tenantId, attributeId);
  }

  async deleteAttribute(tenantId: string, attributeId: string) {
    await this.getAttribute(tenantId, attributeId);
    const [hasValues] = await this.db
      .select({ id: propertyAttributeValues.id })
      .from(propertyAttributeValues)
      .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.attributeId, attributeId)))
      .limit(1);
    if (hasValues) throw new BadRequestException('Cannot delete attribute with existing values');

    await this.db
      .delete(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.id, attributeId)));
  }

  async listEntityAttributeValues(tenantId: string, entityId: string) {
    await this.ensureEntityExists(tenantId, entityId);
    const attrs = await this.db
      .select()
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.scope, 'entity')))
      .orderBy(propertyAttributes.name);

    const values = await this.db
      .select()
      .from(propertyAttributeValues)
      .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.entityId, entityId)));

    const map = new Map(values.map((v) => [v.attributeId, v]));
    return attrs.map((a) => ({ attribute: a, value: map.get(a.id)?.value ?? null }));
  }

  async upsertEntityAttributeValues(tenantId: string, entityId: string, dto: UpsertAttributeValuesDto) {
    await this.ensureEntityExists(tenantId, entityId);

    const attributeIds = Array.from(new Set(dto.values.map((v) => v.attributeId)));
    const attrs = await this.db
      .select()
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.scope, 'entity')));
    const allowed = new Map(attrs.map((a) => [a.id, a]));

    for (const id of attributeIds) {
      if (!allowed.has(id)) throw new BadRequestException('One or more attributes are invalid for entity scope');
    }

    await this.db.transaction(async (tx) => {
      for (const item of dto.values) {
        const [existing] = await tx
          .select({ id: propertyAttributeValues.id })
          .from(propertyAttributeValues)
          .where(
            and(
              eq(propertyAttributeValues.tenantId, tenantId),
              eq(propertyAttributeValues.entityId, entityId),
              eq(propertyAttributeValues.attributeId, item.attributeId)
            )
          )
          .limit(1);

        const shouldDelete = item.value === null || item.value === undefined;
        if (shouldDelete) {
          if (existing) {
            await tx
              .delete(propertyAttributeValues)
              .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.id, existing.id)));
          }
          continue;
        }

        if (existing) {
          await tx
            .update(propertyAttributeValues)
            .set({ value: item.value })
            .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.id, existing.id)));
        } else {
          await tx.insert(propertyAttributeValues).values({
            id: randomUUID(),
            tenantId,
            attributeId: item.attributeId,
            entityId,
            unitId: null,
            value: item.value
          });
        }
      }
    });

    return this.listEntityAttributeValues(tenantId, entityId);
  }

  async listUnitAttributeValues(tenantId: string, unitId: string) {
    await this.ensureUnitExists(tenantId, unitId);
    const attrs = await this.db
      .select()
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.scope, 'unit')))
      .orderBy(propertyAttributes.name);

    const values = await this.db
      .select()
      .from(propertyAttributeValues)
      .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.unitId, unitId)));

    const map = new Map(values.map((v) => [v.attributeId, v]));
    return attrs.map((a) => ({ attribute: a, value: map.get(a.id)?.value ?? null }));
  }

  async upsertUnitAttributeValues(tenantId: string, unitId: string, dto: UpsertAttributeValuesDto) {
    await this.ensureUnitExists(tenantId, unitId);

    const attributeIds = Array.from(new Set(dto.values.map((v) => v.attributeId)));
    const attrs = await this.db
      .select()
      .from(propertyAttributes)
      .where(and(eq(propertyAttributes.tenantId, tenantId), eq(propertyAttributes.scope, 'unit')));
    const allowed = new Map(attrs.map((a) => [a.id, a]));

    for (const id of attributeIds) {
      if (!allowed.has(id)) throw new BadRequestException('One or more attributes are invalid for unit scope');
    }

    await this.db.transaction(async (tx) => {
      for (const item of dto.values) {
        const [existing] = await tx
          .select({ id: propertyAttributeValues.id })
          .from(propertyAttributeValues)
          .where(
            and(
              eq(propertyAttributeValues.tenantId, tenantId),
              eq(propertyAttributeValues.unitId, unitId),
              eq(propertyAttributeValues.attributeId, item.attributeId)
            )
          )
          .limit(1);

        const shouldDelete = item.value === null || item.value === undefined;
        if (shouldDelete) {
          if (existing) {
            await tx
              .delete(propertyAttributeValues)
              .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.id, existing.id)));
          }
          continue;
        }

        if (existing) {
          await tx
            .update(propertyAttributeValues)
            .set({ value: item.value })
            .where(and(eq(propertyAttributeValues.tenantId, tenantId), eq(propertyAttributeValues.id, existing.id)));
        } else {
          await tx.insert(propertyAttributeValues).values({
            id: randomUUID(),
            tenantId,
            attributeId: item.attributeId,
            entityId: null,
            unitId,
            value: item.value
          });
        }
      }
    });

    return this.listUnitAttributeValues(tenantId, unitId);
  }

  async listMedia(tenantId: string, query: { entityId: string; unitId?: string }) {
    await this.ensureEntityExists(tenantId, query.entityId);
    if (query.unitId) await this.ensureUnitExists(tenantId, query.unitId);

    const filters: SQL[] = [
      eq(propertyMedia.tenantId, tenantId),
      eq(propertyMedia.entityId, query.entityId)
    ];
    if (query.unitId) filters.push(eq(propertyMedia.unitId, query.unitId));

    let whereClause = filters[0];
    for (let i = 1; i < filters.length; i += 1) whereClause = and(whereClause, filters[i]) as SQL;

    return this.db.select().from(propertyMedia).where(whereClause).orderBy(propertyMedia.sortOrder);
  }

  async createMedia(tenantId: string, dto: CreatePropertyMediaDto) {
    await this.ensureEntityExists(tenantId, dto.entityId);
    if (dto.unitId) {
      const unit = await this.ensureUnitExists(tenantId, dto.unitId);
      if (unit.entityId !== dto.entityId) throw new BadRequestException('unitId does not belong to entityId');
    }

    const id = randomUUID();
    await this.db.insert(propertyMedia).values({
      id,
      tenantId,
      entityId: dto.entityId,
      unitId: dto.unitId ?? null,
      mediaType: dto.mediaType,
      fileUrl: dto.fileUrl,
      isPublic: dto.isPublic ?? false,
      sortOrder: dto.sortOrder ?? 0,
      createdAt: new Date()
    });

    return this.getMedia(tenantId, id);
  }

  async getMedia(tenantId: string, mediaId: string) {
    const [row] = await this.db
      .select()
      .from(propertyMedia)
      .where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.id, mediaId)))
      .limit(1);
    if (!row) throw new NotFoundException('Media not found');
    return row;
  }

  async updateMedia(tenantId: string, mediaId: string, dto: UpdatePropertyMediaDto) {
    await this.getMedia(tenantId, mediaId);
    const updateData: Partial<typeof propertyMedia.$inferInsert> = {};
    if (dto.mediaType !== undefined) updateData.mediaType = dto.mediaType;
    if (dto.fileUrl !== undefined) updateData.fileUrl = dto.fileUrl;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;

    if (Object.keys(updateData).length === 0) return this.getMedia(tenantId, mediaId);

    await this.db.update(propertyMedia).set(updateData).where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.id, mediaId)));
    return this.getMedia(tenantId, mediaId);
  }

  async deleteMedia(tenantId: string, mediaId: string) {
    await this.getMedia(tenantId, mediaId);
    await this.db.delete(propertyMedia).where(and(eq(propertyMedia.tenantId, tenantId), eq(propertyMedia.id, mediaId)));
  }

  async listLeadPropertyInterests(tenantId: string, query: LeadPropertyInterestListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const filters: SQL[] = [eq(leadPropertyInterests.tenantId, tenantId)];
    if (query.leadId) filters.push(eq(leadPropertyInterests.leadId, query.leadId));
    if (query.unitId) filters.push(eq(leadPropertyInterests.unitId, query.unitId));
    if (query.interestLevel) filters.push(eq(leadPropertyInterests.interestLevel, query.interestLevel));

    let whereClause = filters[0];
    for (let i = 1; i < filters.length; i += 1) whereClause = and(whereClause, filters[i]) as SQL;

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          interest: leadPropertyInterests,
          lead: {
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            email: leads.email
          },
          unit: {
            id: propertyUnits.id,
            unitCode: propertyUnits.unitCode
          }
        })
        .from(leadPropertyInterests)
        .innerJoin(leads, and(eq(leads.id, leadPropertyInterests.leadId), eq(leads.tenantId, tenantId)))
        .innerJoin(propertyUnits, and(eq(propertyUnits.id, leadPropertyInterests.unitId), eq(propertyUnits.tenantId, tenantId)))
        .where(whereClause)
        .orderBy(desc(leadPropertyInterests.updatedAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(leadPropertyInterests).where(whereClause)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return { data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 } };
  }

  async createLeadPropertyInterest(tenantId: string, dto: CreateLeadPropertyInterestDto) {
    await this.ensureLeadExists(tenantId, dto.leadId);
    await this.ensureUnitExists(tenantId, dto.unitId);

    const id = randomUUID();
    const now = new Date();
    await this.db.insert(leadPropertyInterests).values({
      id,
      tenantId,
      leadId: dto.leadId,
      unitId: dto.unitId,
      interestLevel: dto.interestLevel ?? 'warm',
      visitDate: dto.visitDate ?? null,
      visitStatus: dto.visitStatus ?? null,
      notes: dto.notes ?? null,
      createdAt: now,
      updatedAt: now
    });

    return this.getLeadPropertyInterest(tenantId, id);
  }

  async getLeadPropertyInterest(tenantId: string, interestId: string) {
    const [row] = await this.db
      .select({
        interest: leadPropertyInterests,
        lead: {
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          email: leads.email
        },
        unit: {
          id: propertyUnits.id,
          unitCode: propertyUnits.unitCode
        }
      })
      .from(leadPropertyInterests)
      .innerJoin(leads, and(eq(leads.id, leadPropertyInterests.leadId), eq(leads.tenantId, tenantId)))
      .innerJoin(propertyUnits, and(eq(propertyUnits.id, leadPropertyInterests.unitId), eq(propertyUnits.tenantId, tenantId)))
      .where(and(eq(leadPropertyInterests.tenantId, tenantId), eq(leadPropertyInterests.id, interestId)))
      .limit(1);
    if (!row) throw new NotFoundException('Interest not found');
    return row;
  }

  async updateLeadPropertyInterest(tenantId: string, interestId: string, dto: UpdateLeadPropertyInterestDto) {
    await this.getLeadPropertyInterest(tenantId, interestId);
    const updateData: Partial<typeof leadPropertyInterests.$inferInsert> = {};
    if (dto.interestLevel !== undefined) updateData.interestLevel = dto.interestLevel;
    if (dto.visitDate !== undefined) updateData.visitDate = dto.visitDate ?? null;
    if (dto.visitStatus !== undefined) updateData.visitStatus = dto.visitStatus ?? null;
    if (dto.notes !== undefined) updateData.notes = dto.notes ?? null;

    if (Object.keys(updateData).length === 0) return this.getLeadPropertyInterest(tenantId, interestId);

    updateData.updatedAt = new Date();
    await this.db
      .update(leadPropertyInterests)
      .set(updateData)
      .where(and(eq(leadPropertyInterests.tenantId, tenantId), eq(leadPropertyInterests.id, interestId)));
    return this.getLeadPropertyInterest(tenantId, interestId);
  }

  async deleteLeadPropertyInterest(tenantId: string, interestId: string) {
    await this.getLeadPropertyInterest(tenantId, interestId);
    await this.db
      .delete(leadPropertyInterests)
      .where(and(eq(leadPropertyInterests.tenantId, tenantId), eq(leadPropertyInterests.id, interestId)));
  }

  async getUnitPricingBreakups(tenantId: string, unitId: string) {
    await this.ensureUnitExists(tenantId, unitId);
    return this.db
      .select()
      .from(propertyPricingBreakups)
      .where(and(eq(propertyPricingBreakups.tenantId, tenantId), eq(propertyPricingBreakups.unitId, unitId)));
  }

  async replaceUnitPricingBreakups(tenantId: string, unitId: string, dto: ReplacePricingBreakupsDto) {
    await this.ensureUnitExists(tenantId, unitId);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(propertyPricingBreakups)
        .where(and(eq(propertyPricingBreakups.tenantId, tenantId), eq(propertyPricingBreakups.unitId, unitId)));
      await tx.insert(propertyPricingBreakups).values(
        dto.items.map((i) => ({
          id: randomUUID(),
          tenantId,
          unitId,
          label: i.label,
          amount: i.amount.toString()
        }))
      );
    });
    return this.getUnitPricingBreakups(tenantId, unitId);
  }

  private async ensureEntityExists(tenantId: string, entityId: string) {
    const [row] = await this.db
      .select()
      .from(propertyEntities)
      .where(and(eq(propertyEntities.tenantId, tenantId), eq(propertyEntities.id, entityId)))
      .limit(1);
    if (!row) throw new NotFoundException('Property entity not found');
    return row;
  }

  private async ensureUnitExists(tenantId: string, unitId: string) {
    const [row] = await this.db
      .select()
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)))
      .limit(1);
    if (!row) throw new NotFoundException('Property unit not found');
    return row;
  }

  private async ensureLeadExists(tenantId: string, leadId: string) {
    const [row] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);
    if (!row) throw new NotFoundException('Lead not found');
    return row;
  }
}

