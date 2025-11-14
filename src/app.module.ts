import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { MigrationService } from './database/migration.service';
import { TenantsModule } from './tenants/tenants.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', 'env.example']
    }),
    CommonModule,
    AuthModule,
    TenantsModule,
    RolesModule,
    UsersModule,
    PermissionsModule
  ],
  providers: [MigrationService, TenantMiddleware]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
