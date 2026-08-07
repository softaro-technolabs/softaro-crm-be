import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { roles, rolePermissions, permissions, modules, userTenants } from '../database/schema';
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

  async update(tenantId: string, roleId: string, dto: UpdateRoleDto, actorRoleId?: string | null) {
    const role = await this.findByIdForTenant(tenantId, roleId);

    const updateData: Partial<typeof roles.$inferInsert> = {};
    if (dto.name !== undefined) {
      // Check if new name conflicts with existing role
      const existingRole = await this.findByName(tenantId, dto.name);
      if (existingRole && existingRole.id !== roleId) {
        throw new BadRequestException('Role with this name already exists in this tenant');
      }
      updateData.name = dto.name;
    }

    if (dto.isAdmin !== undefined) {
      // Demoting the last admin role would leave the tenant with nobody able to
      // manage roles, users or settings — an unrecoverable state from the UI.
      if (role.isAdmin && !dto.isAdmin) {
        await this.assertNotLastAdminRole(tenantId, roleId);
        if (actorRoleId && actorRoleId === roleId) {
          throw new BadRequestException(
            'You cannot remove admin access from your own role. Ask another admin to do it.',
          );
        }
      }
      updateData.isAdmin = dto.isAdmin;
    }

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
    if (assignments.length === 0) return;

    // De-duplicate: the UI can submit the same pair twice, and the table has a
    // unique index on (tenant, role, permission, module).
    const unique = new Map<string, { permissionId: string; moduleSlug: string }>();
    for (const assignment of assignments) {
      unique.set(`${assignment.permissionId}|${assignment.moduleSlug}`, assignment);
    }
    const deduped = [...unique.values()];

    // Validate that all permission IDs exist
    const uniquePermissionIds = [...new Set(deduped.map((a) => a.permissionId))];
    const existingPermissions = await this.db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.id, uniquePermissionIds));

    if (existingPermissions.length !== uniquePermissionIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid');
    }

    // Validate module slugs too — an unrecognised slug silently produces a
    // permission that can never match any endpoint or menu entry.
    const uniqueSlugs = [...new Set(deduped.map((a) => a.moduleSlug))];
    const existingModules = await this.db
      .select({ slug: modules.slug })
      .from(modules)
      .where(inArray(modules.slug, uniqueSlugs));

    if (existingModules.length !== uniqueSlugs.length) {
      const known = new Set(existingModules.map((m) => m.slug));
      const unknown = uniqueSlugs.filter((slug) => !known.has(slug));
      throw new BadRequestException(`Unknown module slug(s): ${unknown.join(', ')}`);
    }

    await this.db.insert(rolePermissions).values(
      deduped.map((assignment) => ({
        id: randomUUID(),
        tenantId,
        roleId,
        permissionId: assignment.permissionId,
        moduleSlug: assignment.moduleSlug
      }))
    );
  }

  /** Tenant-scoped lookup — use this anywhere a role id arrives from a request. */
  async findByIdForTenant(tenantId: string, roleId: string) {
    const role = await this.findById(roleId);
    if (!role || role.tenantId !== tenantId) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /** Throws when `roleId` is the only admin role left in the tenant. */
  private async assertNotLastAdminRole(tenantId: string, roleId: string) {
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), eq(roles.isAdmin, true), ne(roles.id, roleId)));

    if (Number(count) === 0) {
      throw new BadRequestException(
        'This is the only admin role in the tenant. Create another admin role first.',
      );
    }
  }

  /** How many tenant members currently hold this role. */
  private async countUsersWithRole(tenantId: string, roleId: string): Promise<number> {
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.roleId, roleId)));
    return Number(count);
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
    const role = await this.findByIdForTenant(tenantId, roleId);

    // Users left pointing at a deleted role resolve to zero permissions and an
    // empty sidebar, with nothing explaining why — so refuse and let the admin
    // reassign them first.
    const assignedUsers = await this.countUsersWithRole(tenantId, roleId);
    if (assignedUsers > 0) {
      throw new ConflictException(
        `${assignedUsers} user(s) are still assigned to this role. Move them to another role first.`,
      );
    }

    if (role.isAdmin) {
      await this.assertNotLastAdminRole(tenantId, roleId);
    }

    // Delete role permissions first
    await this.db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

    // Delete role
    await this.db.delete(roles).where(eq(roles.id, roleId));
  }
}

