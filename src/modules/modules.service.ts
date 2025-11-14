import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { modules, tenantModules } from '../database/schema';

@Injectable()
export class ModulesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

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
}



