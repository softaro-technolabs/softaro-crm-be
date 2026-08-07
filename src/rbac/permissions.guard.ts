import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { RequestContextService } from '../common/utils/request-context.service';
import { AccessControlService } from './access-control.service';
import { PERMISSIONS_KEY, type PermissionRequirement } from './permissions.decorator';

/**
 * Enforces `@Permissions('module.action')` requirements.
 *
 * Bypasses:
 *  - platform super-admins
 *  - tenant admin roles (`roles.is_admin`), which are defined as "full access"
 *    and are deliberately not required to carry explicit permission rows
 *
 * Rollout safety: `RBAC_MODE=audit` logs what *would* have been denied without
 * blocking it, so an existing deployment can be checked against real traffic
 * before switching to `enforce`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContextService,
    private readonly accessControl: AccessControlService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<PermissionRequirement[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role_global?: string; role_id?: string | null }; params?: Record<string, string>; method?: string; url?: string }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Missing user context');
    }

    if (user.role_global === 'super_admin') {
      return true;
    }

    // Tenant admins hold every permission by definition.
    const tenantId = request.params?.tenantId ?? this.requestContext.getTenantId();
    if (tenantId && (await this.accessControl.isAdminRole(tenantId, user.role_id ?? null))) {
      return true;
    }

    const granted = new Set(this.requestContext.getPermissions());
    // Any one of the listed requirements is enough — a handler can accept, say,
    // either `leads.read` or `leads.view`.
    const satisfied = required.some((permission) => granted.has(permission));

    if (satisfied) {
      return true;
    }

    const mode = this.configService.get<string>('rbac.mode') ?? 'enforce';
    if (mode === 'audit') {
      this.logger.warn(
        `[RBAC audit] would deny ${request.method} ${request.url} — ` +
          `requires one of [${required.join(', ')}], role ${user.role_id ?? 'none'} has none`,
      );
      return true;
    }

    throw new ForbiddenException(
      `You do not have permission to perform this action (requires ${required.join(' or ')})`,
    );
  }
}
