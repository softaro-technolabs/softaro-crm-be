import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { MigrationService } from './migration.service';

@Injectable()
export class DatabaseSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSyncService.name);
  private hasSynced = false;

  constructor(private readonly migrationService: MigrationService) {}

  async onApplicationBootstrap() {
    if (this.hasSynced) {
      return;
    }

    try {
      await this.migrationService.push();
      this.hasSynced = true;
    } catch (error) {
      this.logger.error('Database sync failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}


