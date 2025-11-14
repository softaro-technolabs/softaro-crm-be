import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { permissions, rolePermissions } from '../database/schema';

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
}

