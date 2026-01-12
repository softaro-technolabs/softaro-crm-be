import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { spawn } from 'child_process';

import { POSTGRES_POOL } from './database.constants';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(POSTGRES_POOL) private readonly pool: Pool
  ) {}

  async push() {
    const autoMigrate = this.configService.get<boolean>('features.autoMigrate', true);
    if (!autoMigrate) {
      this.logger.log('Auto migrations disabled via configuration');
      return;
    }

    // Run custom migrations first (for schema alterations that drizzle-kit might miss)
    await this.runCustomMigrations();

    const databaseUrl = this.configService.get<string>('database.url');
    const dbHost = this.configService.get<string>('database.host');
    const dbPort = this.configService.get<number>('database.port');
    const dbUser = this.configService.get<string>('database.user');
    const dbPassword = this.configService.get<string>('database.password');
    const dbName = this.configService.get<string>('database.name');

    if (!databaseUrl && (!dbHost || !dbUser || !dbPassword || !dbName)) {
      this.logger.warn('Database credentials missing, skipping migrations');
      return;
    }

    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'npx' : 'npx';
    // Use --force flag to skip interactive prompts (available in drizzle-kit 0.18.0+)
    const args = ['drizzle-kit', 'push:pg', '--force'];

    this.logger.log('Checking for database schema changes...');

    // Prepare environment variables for drizzle-kit
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
      // Set CI=true to make tools non-interactive
      CI: 'true'
    };

    // If DATABASE_URL is provided, use it (backward compatibility)
    if (databaseUrl) {
      envVars.DATABASE_URL = databaseUrl;
    } else {
      // Otherwise, use separate variables
      envVars.DB_HOST = dbHost!;
      envVars.DB_PORT = String(dbPort!);
      envVars.DB_USER = dbUser!;
      envVars.DB_PASSWORD = dbPassword!;
      envVars.DB_NAME = dbName!;
    }

    await new Promise<void>((resolve, reject) => {
      // Capture output to check if there are actual changes
      let output = '';
      let errorOutput = '';

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // Don't need stdin with --force flag
        env: envVars,
        shell: isWindows
      });

      // Track if we've seen system table warnings
      let hasSystemTableWarning = false;

      // Capture stdout
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Check for system table warnings - if detected, log warning
        if (text.includes('spatial_ref_sys') || 
            text.includes('geography_columns') || 
            text.includes('geometry_columns') || 
            text.includes('pg_stat_statements') ||
            text.includes('raster_columns')) {
          hasSystemTableWarning = true;
          this.logger.warn('⚠️  System tables detected in migration plan. This should not happen.');
          this.logger.warn('Please check drizzle.config.ts - system tables should be excluded.');
        }
        
        // Log all output for visibility
        const lines = text.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          if (line.trim()) {
            // Log warnings about system tables as warnings, others as info
            if (hasSystemTableWarning && line.includes('DROP TABLE')) {
              this.logger.warn(line.trim());
            } else {
              this.logger.log(line.trim());
            }
          }
        });
      });

      // Capture stderr
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Log warnings/errors
        if (text.includes('Warning') || text.includes('Error')) {
          this.logger.warn(text.trim());
        } else {
          this.logger.log(text.trim());
        }
      });

      child.on('exit', (code) => {
        if (code === 0) {
          // Check if there were actual changes or if schema was already in sync
          if (output.includes('No schema changes') || 
              output.includes('No changes detected') ||
              output.includes('schema is up to date')) {
            this.logger.log('✓ Database schema is already in sync, no changes needed');
          } else if (output.includes('Pushing changes') || 
                     output.includes('Applied') ||
                     output.includes('successfully')) {
            if (hasSystemTableWarning) {
              this.logger.warn('⚠️  Migration completed but system tables were detected. Please review drizzle.config.ts');
            } else {
              this.logger.log('✓ Database schema updated successfully');
            }
          } else {
            this.logger.log('✓ Database schema check completed');
          }
          resolve();
        } else {
          // Log warning but don't fail server startup
          // User can run migrations manually if needed
          if (errorOutput.trim().length > 0) {
            this.logger.warn(errorOutput.trim());
          }
          this.logger.warn(
            `drizzle-kit push:pg exited with code ${code}. ` +
            'Schema changes may not have been applied. Check logs above for details. ' +
            'You may need to run migrations manually or fix the schema.'
          );
          // Still resolve to allow server to start
          resolve();
        }
      });

      child.on('error', (error) => reject(error));
    });
  }

  /**
   * Run custom SQL migrations that need to be executed before drizzle-kit push
   * These handle schema alterations that drizzle-kit might not detect properly
   */
  private async runCustomMigrations() {
    try {
      this.logger.log('Running custom migrations...');

      const client = await this.pool.connect();
      try {
        // Check if leads table exists and if kanban_position is integer
        const tableCheck = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'leads' 
          AND column_name = 'kanban_position'
          AND table_schema = 'public'
        `);

        if (tableCheck.rows.length > 0) {
          const columnType = tableCheck.rows[0].data_type;
          if (columnType === 'integer') {
            this.logger.log('Altering kanban_position column from integer to bigint...');
            await client.query(`
              ALTER TABLE "leads" 
              ALTER COLUMN "kanban_position" TYPE bigint 
              USING "kanban_position"::bigint
            `);
            this.logger.log('Successfully altered kanban_position column to bigint');
          } else {
            this.logger.debug(`kanban_position column type is already ${columnType}`);
          }
        } else {
          this.logger.debug('leads table or kanban_position column does not exist yet, will be created by drizzle-kit');
        }
      } finally {
        client.release();
      }
    } catch (error) {
      // Log error but don't fail - drizzle-kit will handle table creation
      this.logger.warn(
        `Custom migration error (non-critical): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

