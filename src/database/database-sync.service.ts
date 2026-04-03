import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { MigrationService } from './migration.service';
import { DRIZZLE } from './database.constants';
import type { DrizzleDatabase } from './database.types';
import { modules } from './schema';

@Injectable()
export class DatabaseSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSyncService.name);
  private hasSynced = false;

  constructor(
    private readonly migrationService: MigrationService,
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase
  ) {}

  async onApplicationBootstrap() {
    if (this.hasSynced) {
      return;
    }

    try {
      await this.migrationService.push();
      await this.ensureCoreModules();
      this.hasSynced = true;
    } catch (error) {
      this.logger.error('Database sync failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private async ensureCoreModules() {
    const coreModules = [
      { slug: 'deals', name: 'Deals', defaultRoute: '/deals' },
      { slug: 'bookings', name: 'Bookings', defaultRoute: '/bookings' }
    ];

    for (const module of coreModules) {
      const [existing] = await this.db.select({ id: modules.id }).from(modules).where(eq(modules.slug, module.slug)).limit(1);
      if (!existing) {
        await this.db.insert(modules).values({
          id: randomUUID(),
          slug: module.slug,
          name: module.name,
          defaultRoute: module.defaultRoute,
          parentId: null
        });
        this.logger.log(`Seeded core module: ${module.slug}`);
      }
    }
  }
}

