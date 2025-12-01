import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

import * as schema from './schema';
import { DRIZZLE, POSTGRES_POOL } from './database.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const url = configService.get<string>('database.url');
        
        // If DATABASE_URL is provided, use it directly (backward compatibility)
        if (url) {
          return new Pool({
            connectionString: url,
            max: 10
          });
        }

        // Otherwise, use separate environment variables
        return new Pool({
          host: configService.getOrThrow<string>('database.host'),
          port: configService.getOrThrow<number>('database.port'),
          user: configService.getOrThrow<string>('database.user'),
          password: configService.getOrThrow<string>('database.password'),
          database: configService.getOrThrow<string>('database.name'),
          max: 10
        });
      }
    },
    {
      provide: DRIZZLE,
      inject: [POSTGRES_POOL],
      useFactory: (pool: Pool) =>
        drizzle(pool, {
          schema
        })
    }
  ],
  exports: [DRIZZLE, POSTGRES_POOL]
})
export class DatabaseModule {}

