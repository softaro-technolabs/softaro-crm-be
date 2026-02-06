import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { modules, tenantModules } from '../database/schema';
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
      .from(tenantModules)
      .innerJoin(modules, eq(modules.id, tenantModules.moduleId))
      .where(eq(tenantModules.tenantId, tenantId));
  }

  async getAllModules() {
    const rows = await this.db.select().from(modules);
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
      defaultRoute: dto.defaultRoute
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
  async getAccessibleModules(tenantId: string, roleGlobal: string, userPermissions: string[]) {
    // 1. Get all modules enabled for this tenant
    const tenantModulesList = await this.getTenantModules(tenantId);

    // Filter out disabled modules
    const enabledModules = tenantModulesList.filter(
      ({ tenantModule }) => tenantModule ? tenantModule.isEnabled : true
    );

    // 2. If Super Admin, return all enabled modules
    if (roleGlobal === 'super_admin') {
      return enabledModules.map(({ module }) => module);
    }

    // 3. Filter based on permissions
    // A user has access to a module if they have AT LEAST ONE permission for it
    // The permission format is "moduleSlug.action"
    const accessibleModules = enabledModules.filter(({ module }) => {
      return userPermissions.some((perm) => perm.startsWith(`${module.slug}.`));
    });

    return accessibleModules.map(({ module }) => module);
  }
}




