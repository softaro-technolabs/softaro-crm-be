import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { channelPartnerUsers, channelPartners } from '../database/schema';

import type { CpContext, CpTokenPayload } from './cp-portal.service';

/**
 * Guard for the CP portal (/cp/*). Verifies the CP JWT, confirms the account and its
 * partner are still valid/active, and attaches a CpContext to the request.
 */
@Injectable()
export class CpJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = header.slice(7);

    let payload: CpTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<CpTokenPayload>(token, {
        secret: this.configService.get<string>('jwt.secret')
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload?.cp) throw new UnauthorizedException('Not a channel-partner token');

    const [user] = await this.db
      .select({ id: channelPartnerUsers.id, tenantId: channelPartnerUsers.tenantId, channelPartnerId: channelPartnerUsers.channelPartnerId, role: channelPartnerUsers.role })
      .from(channelPartnerUsers)
      .where(and(eq(channelPartnerUsers.id, payload.sub), eq(channelPartnerUsers.tenantId, payload.tenant_id)))
      .limit(1);
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const [partner] = await this.db
      .select({ status: channelPartners.status })
      .from(channelPartners)
      .where(and(eq(channelPartners.tenantId, user.tenantId), eq(channelPartners.id, user.channelPartnerId)))
      .limit(1);
    if (!partner || partner.status !== 'active') throw new UnauthorizedException('Channel partner is not active');

    const ctx: CpContext = {
      cpUserId: user.id,
      channelPartnerId: user.channelPartnerId,
      tenantId: user.tenantId,
      role: user.role
    };
    req.cpUser = ctx;
    return true;
  }
}

/** Injects the authenticated CpContext into a portal controller handler. */
export const CurrentCp = createParamDecorator((_data: unknown, ctx: ExecutionContext): CpContext => {
  const req = ctx.switchToHttp().getRequest();
  return req.cpUser;
});
