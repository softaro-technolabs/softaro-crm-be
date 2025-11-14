import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RequestContextService } from '../common/utils/request-context.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { role_global?: string } }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Missing user context');
    }

    if (user.role_global === 'super_admin') {
      return true;
    }

    const permissions = new Set(this.requestContext.getPermissions());

    const hasAll = required.every((permission) => permissions.has(permission));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}



