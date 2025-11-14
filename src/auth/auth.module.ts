import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth.utils';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseModule } from '../database/database.module';
import { ModulesService } from '../modules/modules.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from '../roles/roles.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn', '1h')
        }
      })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    JwtStrategy,
    JwtAuthGuard,
    SuperAdminGuard,
    TenantsService,
    RolesService,
    PermissionsService,
    ModulesService
  ],
  exports: [AuthService, JwtModule, SuperAdminGuard, JwtAuthGuard]
})
export class AuthModule {}

