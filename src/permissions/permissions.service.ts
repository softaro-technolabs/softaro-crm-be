import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { permissions, rolePermissions, modules } from '../database/schema';
import { CreatePermissionDto, UpdatePermissionDto } from './permissions.dto';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async getCodesForRole(tenantId: string, roleId: string) {
    const rows = await this.db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.roleId, roleId)));

    return rows.map((row) => row.code);
  }

  async getAllCodes() {
    const rows = await this.db.select({ code: permissions.code }).from(permissions);
    return rows.map((row) => row.code);
  }

  async getAll() {
    return this.db.select().from(permissions);
  }

  async findById(id: string) {
    const [permission] = await this.db.select().from(permissions).where(eq(permissions.id, id)).limit(1);
    return permission ?? null;
  }

  async findByCode(code: string) {
    const [permission] = await this.db.select().from(permissions).where(eq(permissions.code, code)).limit(1);
    return permission ?? null;
  }

  async findByModuleSlug(moduleSlug: string) {
    return this.db.select().from(permissions).where(eq(permissions.moduleSlug, moduleSlug));
  }

  async create(dto: CreatePermissionDto) {
    // Check if permission code already exists
    const existingPermission = await this.findByCode(dto.code);
    if (existingPermission) {
      throw new BadRequestException('Permission with this code already exists');
    }

    // Verify module exists
    const [module] = await this.db.select().from(modules).where(eq(modules.slug, dto.moduleSlug)).limit(1);
    if (!module) {
      throw new BadRequestException('Module not found');
    }

    const id = randomUUID();
    await this.db.insert(permissions).values({
      id,
      code: dto.code,
      moduleSlug: dto.moduleSlug
    });

    return this.findById(id);
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.findById(id);
    if (!permission) {
      throw new BadRequestException('Permission not found');
    }

    // Check if new code conflicts with existing permission
    if (dto.code && dto.code !== permission.code) {
      const existingPermission = await this.findByCode(dto.code);
      if (existingPermission) {
        throw new BadRequestException('Permission with this code already exists');
      }
    }

    // Verify module exists if moduleSlug is being updated
    if (dto.moduleSlug) {
      const [module] = await this.db.select().from(modules).where(eq(modules.slug, dto.moduleSlug)).limit(1);
      if (!module) {
        throw new BadRequestException('Module not found');
      }
    }

    const updateData: Partial<typeof permissions.$inferInsert> = {};
    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.moduleSlug !== undefined) updateData.moduleSlug = dto.moduleSlug;

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

  async generateModulePermissions(moduleSlug: string) {
    // Verify module exists
    const [module] = await this.db.select().from(modules).where(eq(modules.slug, moduleSlug)).limit(1);
    if (!module) {
      throw new BadRequestException('Module not found');
    }

    // Standard permission actions for each module
    const actions = ['read', 'write', 'view', 'create', 'update', 'delete', 'export', 'import'];

    const createdPermissions = [];

    for (const action of actions) {
      const code = `${moduleSlug}.${action}`;
      
      // Check if permission already exists
      const existing = await this.findByCode(code);
      if (!existing) {
        const id = randomUUID();
        await this.db.insert(permissions).values({
          id,
          code,
          moduleSlug
        });
        createdPermissions.push({ id, code, moduleSlug });
      }
    }

    return {
      module: moduleSlug,
      created: createdPermissions,
      total: createdPermissions.length
    };
  }
}

