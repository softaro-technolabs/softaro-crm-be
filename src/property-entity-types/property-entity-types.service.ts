import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { propertyEntityTypes } from '../database/schema';
import { CreatePropertyEntityTypeDto, UpdatePropertyEntityTypeDto } from './property-entity-types.dto';

/** Indian real estate industry standard entity types — seeded per tenant on first use. */
const DEFAULT_ENTITY_TYPES: { label: string; value: string; order: number }[] = [
  { label: 'Project',               value: 'project',               order: 1  },
  { label: 'Township',              value: 'township',              order: 2  },
  { label: 'Tower',                 value: 'tower',                 order: 3  },
  { label: 'Wing',                  value: 'wing',                  order: 4  },
  { label: 'Building',              value: 'building',              order: 5  },
  { label: 'Floor',                 value: 'floor',                 order: 6  },
  { label: 'Villa',                 value: 'villa',                 order: 7  },
  { label: 'Row House',             value: 'row_house',             order: 8  },
  { label: 'Bungalow',              value: 'bungalow',              order: 9  },
  { label: 'Plotted Development',   value: 'plotted_development',   order: 10 },
  { label: 'Commercial Complex',    value: 'commercial_complex',    order: 11 },
  { label: 'Office Park',           value: 'office_park',           order: 12 },
  { label: 'Retail Mall',           value: 'retail_mall',           order: 13 },
  { label: 'Industrial Estate',     value: 'industrial_estate',     order: 14 },
  { label: 'Warehouse Park',        value: 'warehouse_park',        order: 15 },
  { label: 'Service Apartments',    value: 'service_apartments',    order: 16 },
];

@Injectable()
export class PropertyEntityTypesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async list(tenantId: string, activeOnly = true) {
    const conditions = [eq(propertyEntityTypes.tenantId, tenantId)];
    if (activeOnly) conditions.push(eq(propertyEntityTypes.isActive, true));

    return this.db
      .select()
      .from(propertyEntityTypes)
      .where(and(...conditions))
      .orderBy(asc(propertyEntityTypes.order), asc(propertyEntityTypes.label));
  }

  async create(tenantId: string, dto: CreatePropertyEntityTypeDto) {
    const [existing] = await this.db
      .select()
      .from(propertyEntityTypes)
      .where(
        and(
          eq(propertyEntityTypes.tenantId, tenantId),
          eq(propertyEntityTypes.value, dto.value),
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestException(`Entity type with value "${dto.value}" already exists.`);
    }

    const id = randomUUID();
    await this.db.insert(propertyEntityTypes).values({
      id,
      tenantId,
      label: dto.label,
      value: dto.value,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    });

    const [created] = await this.db
      .select()
      .from(propertyEntityTypes)
      .where(eq(propertyEntityTypes.id, id))
      .limit(1);

    return created;
  }

  async update(tenantId: string, id: string, dto: UpdatePropertyEntityTypeDto) {
    const [existing] = await this.db
      .select()
      .from(propertyEntityTypes)
      .where(and(eq(propertyEntityTypes.id, id), eq(propertyEntityTypes.tenantId, tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundException('Property entity type not found.');

    await this.db
      .update(propertyEntityTypes)
      .set({
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(propertyEntityTypes.id, id));

    const [updated] = await this.db
      .select()
      .from(propertyEntityTypes)
      .where(eq(propertyEntityTypes.id, id))
      .limit(1);

    return updated;
  }

  async delete(tenantId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(propertyEntityTypes)
      .where(and(eq(propertyEntityTypes.id, id), eq(propertyEntityTypes.tenantId, tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundException('Property entity type not found.');

    await this.db
      .delete(propertyEntityTypes)
      .where(eq(propertyEntityTypes.id, id));
  }

  /** Idempotent — safe to call multiple times. Only inserts missing defaults. */
  async seedDefaults(tenantId: string) {
    const seeded: string[] = [];

    for (const item of DEFAULT_ENTITY_TYPES) {
      const [existing] = await this.db
        .select()
        .from(propertyEntityTypes)
        .where(
          and(
            eq(propertyEntityTypes.tenantId, tenantId),
            eq(propertyEntityTypes.value, item.value),
          ),
        )
        .limit(1);

      if (!existing) {
        await this.db.insert(propertyEntityTypes).values({
          id: randomUUID(),
          tenantId,
          label: item.label,
          value: item.value,
          order: item.order,
          isActive: true,
        });
        seeded.push(item.value);
      }
    }

    return { seeded: seeded.length, items: seeded };
  }
}
