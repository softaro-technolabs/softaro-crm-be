import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { roles } from '../database/schema';
import { RequestContextService } from '../common/utils/request-context.service';

/** Who is calling, and whether they may act on tenant-wide data. */
export interface TenantActor {
  userId: string;
  roleId: string | null;
  /** Tenant admin (`roles.is_admin`) or platform super-admin. */
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Single source of truth for "is this caller an admin of this tenant".
 *
 * Admin status lives on `roles.is_admin` — the same flag the role editor writes
 * and the frontend reads — rather than in the JWT, so revoking someone's admin
 * role takes effect on their next request instead of on their next login.
 */
@Injectable()
export class AccessControlService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly requestContext: RequestContextService,
  ) {}

  /** Verifies tenant membership and resolves the caller's admin status. */
  async resolveActor(tenantId: string): Promise<TenantActor> {
    this.requestContext.verifyTenantAccess(tenantId);

    const userId = this.requestContext.getUserId();
    if (!userId) throw new ForbiddenException('User context not found');

    const ctx = this.requestContext.getUser();

    if (ctx?.role_global === 'super_admin') {
      return { userId, roleId: ctx.role_id ?? null, isAdmin: true, isSuperAdmin: true };
    }

    const roleId = ctx?.role_id ?? null;
    return {
      userId,
      roleId,
      isAdmin: await this.isAdminRole(tenantId, roleId),
      isSuperAdmin: false,
    };
  }

  /** True when the role exists in this tenant and carries the admin flag. */
  async isAdminRole(tenantId: string, roleId: string | null): Promise<boolean> {
    if (!roleId) return false;

    const [role] = await this.db
      .select({ isAdmin: roles.isAdmin })
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)))
      .limit(1);

    return role?.isAdmin ?? false;
  }

  /** Resolves the actor and rejects non-admins in one step. */
  async requireAdmin(tenantId: string, action = 'perform this action'): Promise<TenantActor> {
    const actor = await this.resolveActor(tenantId);
    this.assertAdmin(actor, action);
    return actor;
  }

  assertAdmin(actor: TenantActor, action = 'perform this action'): void {
    if (!actor.isAdmin) {
      throw new ForbiddenException(`You do not have permission to ${action}`);
    }
  }
}
