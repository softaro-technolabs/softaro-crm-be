import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { permissions, rolePermissions, modules } from '../database/schema';
import { CreatePermissionDto, UpdatePermissionDto, PermissionListQueryDto } from './permissions.dto';
import { PaginationUtil } from '../common/utils/pagination.util';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) { }

  async getCodesForRole(tenantId: string, roleId: string) {
    const rows = await this.db
      .select({
        action: permissions.action,
        moduleSlug: rolePermissions.moduleSlug
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

    // Construct "module.action" strings
    return rows.map((row) => `${row.moduleSlug}.${row.action}`);
  }

  async getAllActions() {
    return this.db.select().from(permissions);
  }

  async getAll(query: PermissionListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [];

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [permissions.action, permissions.description],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) allFilters.push(searchFilter);

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      action: permissions.action
    };

    const orderBy = PaginationUtil.buildOrderBy(
      permissions.action,
      query.sortBy,
      query.sortOrder || 'asc',
      allowedSortFields
    );

    const [results, totalRows] = await Promise.all([
      this.db
        .select()
        .from(permissions)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(permissions).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async findById(id: string) {
    const [permission] = await this.db.select().from(permissions).where(eq(permissions.id, id)).limit(1);
    return permission ?? null;
  }

  async findByAction(action: string) {
    const [permission] = await this.db.select().from(permissions).where(eq(permissions.action, action)).limit(1);
    return permission ?? null;
  }

  async create(dto: CreatePermissionDto) {
    // Check if permission action already exists
    const existingPermission = await this.findByAction(dto.action);
    if (existingPermission) {
      throw new BadRequestException('Permission action already exists');
    }

    const id = randomUUID();
    await this.db.insert(permissions).values({
      id,
      action: dto.action,
      description: dto.description
    });

    return this.findById(id);
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.findById(id);
    if (!permission) {
      throw new BadRequestException('Permission not found');
    }

    // Check if new action conflicts with existing permission
    if (dto.action && dto.action !== permission.action) {
      const existingPermission = await this.findByAction(dto.action);
      if (existingPermission) {
        throw new BadRequestException('Permission action already exists');
      }
    }

    const updateData: Partial<typeof permissions.$inferInsert> = {};
    if (dto.action !== undefined) updateData.action = dto.action;
    if (dto.description !== undefined) updateData.description = dto.description;

    await this.db.update(permissions).set(updateData).where(eq(permissions.id, id));

    return this.findById(id);
  }

  async delete(id: string) {
    const permission = await this.findById(id);
    if (!permission) {
      throw new BadRequestException('Permission not found');
    }

    // Check if permission is assigned to any roles
    const assignedRoles = await this.db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, id))
      .limit(1);

    if (assignedRoles.length > 0) {
      throw new BadRequestException('Cannot delete permission that is assigned to roles');
    }

    await this.db.delete(permissions).where(eq(permissions.id, id));
  }

  /**
   * Ensures standard permissions exist in the master table
   */
  async seedStandardPermissions() {
    const standards = ['read', 'write', 'create', 'update', 'delete', 'view', 'export', 'import'];

    for (const action of standards) {
      const existing = await this.findByAction(action);
      if (!existing) {
        await this.create({ action, description: `Standard ${action} permission` });
      }
    }
  }
}
