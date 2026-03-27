import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { roles, rolePermissions, permissions } from '../database/schema';
import { CreateRoleDto, UpdateRoleDto, RoleListQueryDto } from './roles.dto';
import { PaginationUtil } from '../common/utils/pagination.util';

@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) { }

  async create(tenantId: string, dto: CreateRoleDto) {
    // Check if role with same name already exists in this tenant
    const existingRole = await this.findByName(tenantId, dto.name);
    if (existingRole) {
      throw new BadRequestException('Role with this name already exists in this tenant');
    }

    const id = randomUUID();
    await this.db.insert(roles).values({
      id,
      tenantId,
      name: dto.name,
      isAdmin: dto.isAdmin ?? false
    });

    // Assign permissions if provided
    if (dto.permissions && dto.permissions.length > 0) {
      await this.assignPermissions(tenantId, id, dto.permissions);
    }

    return this.findById(id);
  }

  async update(tenantId: string, roleId: string, dto: UpdateRoleDto) {
    const role = await this.findById(roleId);
    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.tenantId !== tenantId) {
      throw new BadRequestException('Role does not belong to this tenant');
    }

    const updateData: Partial<typeof roles.$inferInsert> = {};
    if (dto.name !== undefined) {
      // Check if new name conflicts with existing role
      const existingRole = await this.findByName(tenantId, dto.name);
      if (existingRole && existingRole.id !== roleId) {
        throw new BadRequestException('Role with this name already exists in this tenant');
      }
      updateData.name = dto.name;
    }
    if (dto.isAdmin !== undefined) updateData.isAdmin = dto.isAdmin;

    await this.db.update(roles).set(updateData).where(eq(roles.id, roleId));

    // Update permissions if provided
    if (dto.permissions !== undefined) {
      // Remove all existing permissions
      await this.db
        .delete(rolePermissions)
        .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

      // Add new permissions
      if (dto.permissions.length > 0) {
        await this.assignPermissions(tenantId, roleId, dto.permissions);
      }
    }

    return this.findById(roleId);
  }

  async assignPermissions(
    tenantId: string,
    roleId: string,
    assignments: { permissionId: string; moduleSlug: string }[]
  ) {
    // Validate that all permission IDs exist
    if (assignments.length > 0) {
      const permissionIds = assignments.map((a) => a.permissionId);
      const uniquePermissionIds = [...new Set(permissionIds)];

      const existingPermissions = await this.db
        .select()
        .from(permissions)
        .where(inArray(permissions.id, uniquePermissionIds));

      if (existingPermissions.length !== uniquePermissionIds.length) {
        throw new BadRequestException('One or more permission IDs are invalid');
      }

      const values = assignments.map((assignment) => ({
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId: assignment.permissionId,
        moduleSlug: assignment.moduleSlug
      }));

      await this.db.insert(rolePermissions).values(values);
    }
  }

  async findById(id: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);

    if (!role) {
      return null;
    }

    const rolePerms = await this.db
      .select({
        permissionId: rolePermissions.permissionId,
        moduleSlug: rolePermissions.moduleSlug,
        action: permissions.action,
        description: permissions.description
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, id));

    return {
      ...role,
      permissions: rolePerms
    };
  }

  async findByName(tenantId: string, name: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), eq(roles.name, name)))
      .limit(1);
    return role ?? null;
  }

  async findByTenant(tenantId: string, query: RoleListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [eq(roles.tenantId, tenantId)];

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [roles.name],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) allFilters.push(searchFilter);

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      name: roles.name,
      isAdmin: roles.isAdmin,
      createdAt: roles.createdAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      roles.createdAt,
      query.sortBy,
      query.sortOrder || 'asc',
      allowedSortFields
    );

    const [results, totalRows] = await Promise.all([
      this.db
        .select()
        .from(roles)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(roles).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async delete(tenantId: string, roleId: string) {
    const role = await this.findById(roleId);
    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.tenantId !== tenantId) {
      throw new BadRequestException('Role does not belong to this tenant');
    }

    // Delete role permissions first
    await this.db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

    // Delete role
    await this.db.delete(roles).where(eq(roles.id, roleId));
  }
}

