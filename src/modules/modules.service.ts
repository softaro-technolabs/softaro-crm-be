import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { modules, tenantModules, permissions, rolePermissions, roles } from '../database/schema';
import { CreateModuleDto, UpdateModuleDto } from './modules.dto';

@Injectable()
export class ModulesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) { }

  async getTenantModules(tenantId: string) {
    return this.db
      .select({
        module: modules,
        tenantModule: tenantModules
      })
      .from(modules)
      .leftJoin(tenantModules, and(eq(modules.id, tenantModules.moduleId), eq(tenantModules.tenantId, tenantId)))
      .where(eq(modules.isActive, true))
      .orderBy(asc(modules.sequence));
  }

  async getAllModules() {
    const rows = await this.db
      .select()
      .from(modules)
      .where(eq(modules.isActive, true))
      .orderBy(asc(modules.sequence));
    return rows.map((module) => ({
      module,
      tenantModule: {
        tenantId: null,
        moduleId: module.id,
        isEnabled: true
      }
    }));
  }

  async findById(id: string) {
    const [module] = await this.db.select().from(modules).where(eq(modules.id, id)).limit(1);
    return module ?? null;
  }

  async findBySlug(slug: string) {
    const [module] = await this.db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    return module ?? null;
  }

  async create(dto: CreateModuleDto) {
    // Check if module with this slug already exists
    const existingModule = await this.findBySlug(dto.slug);
    if (existingModule) {
      throw new BadRequestException('Module with this slug already exists');
    }

    const id = randomUUID();
    await this.db.insert(modules).values({
      id,
      slug: dto.slug,
      name: dto.name,
      defaultRoute: dto.defaultRoute,
      parentId: dto.parentId ?? null,
      sequence: dto.sequence ?? 0
    });

    return this.findById(id);
  }

  async update(id: string, dto: UpdateModuleDto) {
    const module = await this.findById(id);
    if (!module) {
      throw new BadRequestException('Module not found');
    }

    const updateData: Partial<typeof modules.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.defaultRoute !== undefined) updateData.defaultRoute = dto.defaultRoute;
    if (dto.parentId !== undefined) updateData.parentId = dto.parentId;
    if (dto.sequence !== undefined) updateData.sequence = dto.sequence;

    await this.db.update(modules).set(updateData).where(eq(modules.id, id));

    return this.findById(id);
  }

  async delete(id: string) {
    const module = await this.findById(id);
    if (!module) {
      throw new BadRequestException('Module not found');
    }

    // Check if module is assigned to any tenants
    const assignedTenants = await this.db
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.moduleId, id))
      .limit(1);

    if (assignedTenants.length > 0) {
      throw new BadRequestException('Cannot delete module that is assigned to tenants');
    }

    await this.db.delete(modules).where(eq(modules.id, id));
  }
  async getAccessibleModules(tenantId: string, roleGlobal: string, roleId: string | null) {
    // 1. Get all modules enabled for this tenant
    const tenantModulesList = await this.getTenantModules(tenantId);

    // Filter out disabled modules
    const enabledModules = tenantModulesList.filter(
      ({ tenantModule }) => tenantModule ? tenantModule.isEnabled : true
    );

    // 2. Get all master permissions (needed for super admin or to map details)
    const allActions = await this.db.select().from(permissions);

    // 3. If Super Admin, return all enabled modules with ALL permissions
    // Super admins conceptually have all permissions on all modules
    if (roleGlobal === 'super_admin') {
      return enabledModules.map(({ module }) => ({
        ...module,
        permissions: allActions
      }));
    }

    // 4. If Normal User
    if (!roleId) {
      return []; // No role, no permissions
    }

    // Admin roles mean "full access" and are not required to carry explicit
    // permission rows — the default tenant Admin role is created with none, so
    // filtering it by permissions would hand the owner an empty sidebar.
    const [role] = await this.db
      .select({ isAdmin: roles.isAdmin })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1);

    if (role?.isAdmin) {
      return enabledModules.map(({ module }) => ({
        ...module,
        permissions: allActions
      }));
    }

    // Fetch assigned permissions for this role from DB to get ID + Action + Module
    const assignedPerms = await this.db
      .select({
        permissionId: permissions.id,
        action: permissions.action,
        description: permissions.description,
        moduleSlug: rolePermissions.moduleSlug
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

    // Group permissions by module slug
    const permsByModule = new Map<string, typeof allActions>();
    for (const p of assignedPerms) {
      if (!permsByModule.has(p.moduleSlug)) {
        permsByModule.set(p.moduleSlug, []);
      }
      permsByModule.get(p.moduleSlug)?.push({
        id: p.permissionId,
        action: p.action,
        description: p.description
      });
    }

    // Filter enabled modules where user has at least one permission
    const grantedIds = new Set(
      enabledModules.filter(({ module }) => permsByModule.has(module.slug)).map(({ module }) => module.id)
    );

    // Pull in the parents of any granted child. The sidebar only renders children
    // underneath a rendered parent, so a granted child whose parent was filtered
    // out would become unreachable despite the permission existing.
    const visibleIds = new Set(grantedIds);
    for (const { module } of enabledModules) {
      if (!grantedIds.has(module.id)) continue;
      let parentId = module.parentId;
      while (parentId && !visibleIds.has(parentId)) {
        visibleIds.add(parentId);
        parentId = enabledModules.find(({ module: m }) => m.id === parentId)?.module.parentId ?? null;
      }
    }

    return enabledModules
      .filter(({ module }) => visibleIds.has(module.id))
      .map(({ module }) => ({
        ...module,
        // A parent included only to host its children carries no permissions of
        // its own — the frontend must not treat that as access to the parent page.
        permissions: permsByModule.get(module.slug) ?? []
      }));
  }
}
