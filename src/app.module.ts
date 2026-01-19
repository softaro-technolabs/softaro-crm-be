import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import configuration from './config/configuration';
import { DatabaseSyncService } from './database/database-sync.service';
import { DatabaseModule } from './database/database.module';
import { MigrationService } from './database/migration.service';
import { LeadsModule } from './leads/leads.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';
import { ModulesModule } from './modules/modules.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PropertiesModule } from './properties/properties.module';
import { RolesModule } from './roles/roles.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', 'env.example']
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    TenantsModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    ModulesModule,
    LeadsModule,
    PropertiesModule,
    KeepAliveModule
  ],
  providers: [MigrationService, DatabaseSyncService, TenantMiddleware]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
