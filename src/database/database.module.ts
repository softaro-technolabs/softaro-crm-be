import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createPool } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

import * as schema from './schema';
import { DRIZZLE, MYSQL_POOL } from './database.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MYSQL_POOL,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const url = configService.get<string>('database.url');
        
        // If DATABASE_URL is provided, parse it (backward compatibility)
        if (url) {
          const parsed = new URL(url);
          return createPool({
            host: parsed.hostname,
            port: Number(parsed.port || '3306'),
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            database: parsed.pathname.replace(/^\//, ''),
            waitForConnections: true,
            connectionLimit: Number(parsed.searchParams.get('connectionLimit') ?? '10'),
            namedPlaceholders: true,
            decimalNumbers: true
          });
        }

        // Otherwise, use separate environment variables
        return createPool({
          host: configService.getOrThrow<string>('database.host'),
          port: configService.getOrThrow<number>('database.port'),
          user: configService.getOrThrow<string>('database.user'),
          password: configService.getOrThrow<string>('database.password'),
          database: configService.getOrThrow<string>('database.name'),
          waitForConnections: true,
          connectionLimit: 10,
          namedPlaceholders: true,
          decimalNumbers: true
        });
      }
    },
    {
      provide: DRIZZLE,
      inject: [MYSQL_POOL],
      useFactory: (pool: ReturnType<typeof createPool>) =>
        drizzle(pool, {
          schema,
          mode: 'default'
        })
    }
  ],
  exports: [DRIZZLE, MYSQL_POOL]
})
export class DatabaseModule {}

