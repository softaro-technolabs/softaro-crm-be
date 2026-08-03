import { randomUUID } from 'crypto';

import { BadRequestException, Inject, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import {
  channelPartnerUsers,
  channelPartners,
  cpIncentives,
  cpLeadAttributions,
  leadStatuses,
  leads,
  propertyEntities,
  propertyUnits
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';

import type { CpInventoryQueryDto, CpLoginDto, CpRegisterLeadDto } from './channel-partners.dto';

export interface CpContext {
  cpUserId: string;
  channelPartnerId: string;
  tenantId: string;
  role: string;
}

/** JWT payload issued to CP portal users. `cp: true` distinguishes it from staff tokens. */
export interface CpTokenPayload {
  sub: string;
  cp: true;
  channel_partner_id: string;
  tenant_id: string;
  role: string;
}

@Injectable()
export class CpPortalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async login(dto: CpLoginDto) {
    const filters: SQL[] = [eq(channelPartnerUsers.email, dto.email)];
    if (dto.tenantId) filters.push(eq(channelPartnerUsers.tenantId, dto.tenantId));
    const rows = await this.db
      .select()
      .from(channelPartnerUsers)
      .where(filters.length === 1 ? filters[0] : and(...filters))
      .limit(2);

    if (rows.length === 0) throw new UnauthorizedException('Invalid credentials');
    if (rows.length > 1) throw new BadRequestException('Multiple accounts found — provide tenantId');
    const user = rows[0];

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const [partner] = await this.db
      .select({ id: channelPartners.id, name: channelPartners.name, status: channelPartners.status })
      .from(channelPartners)
      .where(and(eq(channelPartners.tenantId, user.tenantId), eq(channelPartners.id, user.channelPartnerId)))
      .limit(1);
    if (!partner) throw new UnauthorizedException('Channel partner not found');
    if (partner.status !== 'active') throw new UnauthorizedException('Channel partner account is not active');

    const payload: CpTokenPayload = {
      sub: user.id,
      cp: true,
      channel_partner_id: user.channelPartnerId,
      tenant_id: user.tenantId,
      role: user.role
    };
    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn', '1h')
    });

    return {
      token,
      cp: { userId: user.id, name: user.name, role: user.role, channelPartnerId: partner.id, partnerName: partner.name, tenantId: user.tenantId }
    };
  }

  /** Limited inventory projection — internal cost/discount fields are never exposed to CPs. */
  async listInventory(ctx: CpContext, query: CpInventoryQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters: SQL[] = [eq(propertyUnits.tenantId, ctx.tenantId), eq(propertyUnits.unitStatus, 'available')];
    if (query.entityId) filters.push(eq(propertyUnits.entityId, query.entityId));
    const whereClause = filters.length === 1 ? filters[0] : and(...filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: propertyUnits.id,
          unitCode: propertyUnits.unitCode,
          unitStatus: propertyUnits.unitStatus,
          price: propertyUnits.price,
          saleableArea: propertyUnits.saleableArea,
          projectName: propertyEntities.name,
          projectId: propertyEntities.id
        })
        .from(propertyUnits)
        .innerJoin(propertyEntities, and(eq(propertyEntities.id, propertyUnits.entityId), eq(propertyEntities.tenantId, ctx.tenantId)))
        .where(whereClause)
        .orderBy(desc(propertyUnits.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(propertyUnits).where(whereClause)
    ]);
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async registerLead(ctx: CpContext, dto: CpRegisterLeadDto) {
    // Reject if this phone is already attributed to a DIFFERENT channel partner.
    const sameLeads = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, ctx.tenantId), eq(leads.phone, dto.phone)));

    if (sameLeads.length > 0) {
      const leadIds = sameLeads.map((l) => l.id);
      const attributions = await this.db
        .select({ channelPartnerId: cpLeadAttributions.channelPartnerId })
        .from(cpLeadAttributions)
        .where(and(eq(cpLeadAttributions.tenantId, ctx.tenantId), inArray(cpLeadAttributions.leadId, leadIds)));
      const claimedByOther = attributions.some((a) => a.channelPartnerId !== ctx.channelPartnerId);
      if (claimedByOther) {
        throw new BadRequestException('This lead is already registered by another channel partner');
      }
    }

    const statusId = await this.resolveDefaultStatusId(ctx.tenantId);
    const leadId = randomUUID();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.insert(leads).values({
        id: leadId,
        tenantId: ctx.tenantId,
        statusId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        requirementType: dto.requirementType ?? 'buy',
        captureChannel: 'channel_partner',
        notes: dto.notes ?? null,
        createdAt: now,
        updatedAt: now
      });
      await tx.insert(cpLeadAttributions).values({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        channelPartnerId: ctx.channelPartnerId,
        leadId,
        attributedAt: now
      });
    });

    return { leadId, attributed: true };
  }

  async listMyIncentives(ctx: CpContext) {
    return this.db
      .select({
        id: cpIncentives.id,
        dealId: cpIncentives.dealId,
        bookingAmount: cpIncentives.bookingAmount,
        incentivePercentage: cpIncentives.incentivePercentage,
        incentiveAmount: cpIncentives.incentiveAmount,
        status: cpIncentives.status,
        createdAt: cpIncentives.createdAt
      })
      .from(cpIncentives)
      .where(and(eq(cpIncentives.tenantId, ctx.tenantId), eq(cpIncentives.channelPartnerId, ctx.channelPartnerId)))
      .orderBy(desc(cpIncentives.createdAt));
  }

  private async resolveDefaultStatusId(tenantId: string) {
    const statuses = await this.db
      .select({ id: leadStatuses.id })
      .from(leadStatuses)
      .where(eq(leadStatuses.tenantId, tenantId))
      .orderBy(leadStatuses.order)
      .limit(1);
    if (statuses.length === 0) {
      throw new InternalServerErrorException('Lead pipeline is not configured for this tenant');
    }
    return statuses[0].id;
  }
}
