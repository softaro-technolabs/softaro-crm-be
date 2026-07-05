import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { PublicTenantsController } from './public-tenants.controller';
import { PublicRegistrationController } from './public-registration.controller';
import { TenantsService } from './tenants.service';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { PropertiesModule } from '../properties/properties.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [DatabaseModule, UsersModule, RolesModule, PropertiesModule, LeadsModule],
  controllers: [TenantsController, PublicTenantsController, PublicRegistrationController],
  providers: [TenantsService],
  exports: [TenantsService]
})
export class TenantsModule {}

