import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [DatabaseModule, UsersModule, RolesModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService]
})
export class TenantsModule {}

