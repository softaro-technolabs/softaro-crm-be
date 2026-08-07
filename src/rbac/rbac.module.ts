import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccessControlService } from './access-control.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Global so every feature module can inject {@link AccessControlService} and
 * apply {@link PermissionsGuard} without repeating imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AccessControlService, PermissionsGuard],
  exports: [AccessControlService, PermissionsGuard],
})
export class RbacModule {}
