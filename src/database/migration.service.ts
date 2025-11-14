import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private readonly configService: ConfigService) {}

  async push() {
    const autoMigrate = this.configService.get<boolean>('features.autoMigrate', true);
    if (!autoMigrate) {
      this.logger.log('Auto migrations disabled via configuration');
      return;
    }

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
    const args = ['drizzle-kit', 'push:mysql'];

    this.logger.log('Running drizzle-kit push:mysql...');

    // Prepare environment variables for drizzle-kit
    const envVars: NodeJS.ProcessEnv = {
      ...process.env
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
      const child = spawn(command, args, {
        stdio: 'inherit',
        env: envVars,
        shell: isWindows
      });

      child.on('exit', (code) => {
        if (code === 0) {
          this.logger.log('Database schema is in sync');
          resolve();
        } else {
          reject(new Error(`drizzle-kit push:mysql exited with code ${code}`));
        }
      });

      child.on('error', (error) => reject(error));
    });
  }
}

