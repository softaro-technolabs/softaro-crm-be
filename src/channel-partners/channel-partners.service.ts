import { randomUUID } from 'crypto';

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import {
  channelPartnerUsers,
  channelPartners,
  cpIncentives,
  cpLeadAttributions,
  leads
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import { roundMoney } from '../common/utils/cost-sheet.util';

import type {
  ChannelPartnerListQueryDto,
  CreateChannelPartnerDto,
  CreateCpUserDto,
  IncentiveListQueryDto,
  UpdateChannelPartnerDto
} from './channel-partners.dto';

@Injectable()
export class ChannelPartnersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  // ─── Partners ───────────────────────────────────────────────────────────────
  async listPartners(tenantId: string, query: ChannelPartnerListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters: SQL[] = [eq(channelPartners.tenantId, tenantId)];
    if (query.status) filters.push(eq(channelPartners.status, query.status));
    if (query.search) {
      const search = PaginationUtil.buildSearchFilter({ fields: [channelPartners.name, channelPartners.firmName], term: query.search });
      if (search) filters.push(search);
    }
    const whereClause = PaginationUtil.buildFilters(filters);

    const [rows, totalRows] = await Promise.all([
      this.db.select().from(channelPartners).where(whereClause || undefined).orderBy(desc(channelPartners.createdAt)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(channelPartners).where(whereClause || undefined)
    ]);
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getPartner(tenantId: string, partnerId: string) {
    const partner = await this.ensurePartnerExists(tenantId, partnerId);
    const users = await this.db
      .select({ id: channelPartnerUsers.id, name: channelPartnerUsers.name, email: channelPartnerUsers.email, phone: channelPartnerUsers.phone, role: channelPartnerUsers.role })
      .from(channelPartnerUsers)
      .where(and(eq(channelPartnerUsers.tenantId, tenantId), eq(channelPartnerUsers.channelPartnerId, partnerId)));
    return { ...partner, users };
  }

  async createPartner(tenantId: string, dto: CreateChannelPartnerDto, options?: { createdByUserId?: string | null }) {
    const id = randomUUID();
    const now = new Date();
    await this.db.insert(channelPartners).values({
      id,
      tenantId,
      name: dto.name,
      firmName: dto.firmName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      reraRegNo: dto.reraRegNo ?? null,
      status: dto.status ?? 'pending',
      commissionPercentage: dto.commissionPercentage !== undefined ? dto.commissionPercentage.toString() : '2',
      createdByUserId: options?.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now
    });
    return this.getPartner(tenantId, id);
  }

  async updatePartner(tenantId: string, partnerId: string, dto: UpdateChannelPartnerDto) {
    await this.ensurePartnerExists(tenantId, partnerId);
    const updateData: Partial<typeof channelPartners.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.firmName !== undefined) updateData.firmName = dto.firmName ?? null;
    if (dto.phone !== undefined) updateData.phone = dto.phone ?? null;
    if (dto.email !== undefined) updateData.email = dto.email ?? null;
    if (dto.reraRegNo !== undefined) updateData.reraRegNo = dto.reraRegNo ?? null;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.commissionPercentage !== undefined) updateData.commissionPercentage = dto.commissionPercentage.toString();

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date();
      await this.db.update(channelPartners).set(updateData).where(and(eq(channelPartners.tenantId, tenantId), eq(channelPartners.id, partnerId)));
    }
    return this.getPartner(tenantId, partnerId);
  }

  async deletePartner(tenantId: string, partnerId: string) {
    await this.ensurePartnerExists(tenantId, partnerId);
    const [incentive] = await this.db
      .select({ id: cpIncentives.id })
      .from(cpIncentives)
      .where(and(eq(cpIncentives.tenantId, tenantId), eq(cpIncentives.channelPartnerId, partnerId)))
      .limit(1);
    if (incentive) throw new BadRequestException('Cannot delete a partner with recorded incentives');

    await this.db.transaction(async (tx) => {
      await tx.delete(channelPartnerUsers).where(and(eq(channelPartnerUsers.tenantId, tenantId), eq(channelPartnerUsers.channelPartnerId, partnerId)));
      await tx.delete(cpLeadAttributions).where(and(eq(cpLeadAttributions.tenantId, tenantId), eq(cpLeadAttributions.channelPartnerId, partnerId)));
      await tx.delete(channelPartners).where(and(eq(channelPartners.tenantId, tenantId), eq(channelPartners.id, partnerId)));
    });
  }

  // ─── CP portal accounts ───────────────────────────────────────────────────────
  async createCpUser(tenantId: string, partnerId: string, dto: CreateCpUserDto) {
    await this.ensurePartnerExists(tenantId, partnerId);
    const [existing] = await this.db
      .select({ id: channelPartnerUsers.id })
      .from(channelPartnerUsers)
      .where(and(eq(channelPartnerUsers.tenantId, tenantId), eq(channelPartnerUsers.email, dto.email)))
      .limit(1);
    if (existing) throw new BadRequestException('A portal account with this email already exists');

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();
    await this.db.insert(channelPartnerUsers).values({
      id,
      tenantId,
      channelPartnerId: partnerId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
      role: dto.role ?? 'cp_agent',
      createdAt: now,
      updatedAt: now
    });
    return { id, name: dto.name, email: dto.email, role: dto.role ?? 'cp_agent' };
  }

  // ─── Incentives ────────────────────────────────────────────────────────────────
  async listIncentives(tenantId: string, query: IncentiveListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters: SQL[] = [eq(cpIncentives.tenantId, tenantId)];
    if (query.channelPartnerId) filters.push(eq(cpIncentives.channelPartnerId, query.channelPartnerId));
    if (query.status) filters.push(eq(cpIncentives.status, query.status));
    const whereClause = PaginationUtil.buildFilters(filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          incentive: cpIncentives,
          partner: { id: channelPartners.id, name: channelPartners.name, firmName: channelPartners.firmName }
        })
        .from(cpIncentives)
        .innerJoin(channelPartners, and(eq(channelPartners.id, cpIncentives.channelPartnerId), eq(channelPartners.tenantId, tenantId)))
        .where(whereClause || undefined)
        .orderBy(desc(cpIncentives.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(cpIncentives).where(whereClause || undefined)
    ]);
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  /** Approve or mark-paid transitions (internal only). accrued → approved → paid. */
  async setIncentiveStatus(tenantId: string, incentiveId: string, next: 'approved' | 'paid') {
    const [row] = await this.db
      .select()
      .from(cpIncentives)
      .where(and(eq(cpIncentives.tenantId, tenantId), eq(cpIncentives.id, incentiveId)))
      .limit(1);
    if (!row) throw new NotFoundException('Incentive not found');

    if (next === 'approved' && row.status !== 'accrued') {
      throw new BadRequestException('Only accrued incentives can be approved');
    }
    if (next === 'paid' && row.status !== 'approved') {
      throw new BadRequestException('Only approved incentives can be marked paid');
    }

    await this.db
      .update(cpIncentives)
      .set({ status: next, updatedAt: new Date() })
      .where(and(eq(cpIncentives.tenantId, tenantId), eq(cpIncentives.id, incentiveId)));
    const [updated] = await this.db.select().from(cpIncentives).where(eq(cpIncentives.id, incentiveId)).limit(1);
    return updated;
  }

  async listAttributedLeads(tenantId: string, partnerId: string) {
    await this.ensurePartnerExists(tenantId, partnerId);
    return this.db
      .select({
        attribution: cpLeadAttributions,
        lead: { id: leads.id, name: leads.name, phone: leads.phone, email: leads.email }
      })
      .from(cpLeadAttributions)
      .innerJoin(leads, and(eq(leads.id, cpLeadAttributions.leadId), eq(leads.tenantId, tenantId)))
      .where(and(eq(cpLeadAttributions.tenantId, tenantId), eq(cpLeadAttributions.channelPartnerId, partnerId)))
      .orderBy(desc(cpLeadAttributions.attributedAt));
  }

  /**
   * Called from quotations.convertToDeal (inside its transaction). If the deal's lead was
   * registered by a CP, accrue a commission incentive. Money is computed server-side and rounded.
   * `tx` is the surrounding transaction so this participates in the same commit/rollback.
   */
  async accrueIncentiveForDeal(
    tx: DrizzleDatabase,
    tenantId: string,
    params: { leadId: string; dealId: string; dealTotal: number }
  ): Promise<{ id: string; incentiveAmount: number } | null> {
    if (!params.leadId) return null;

    const [attribution] = await tx
      .select({ channelPartnerId: cpLeadAttributions.channelPartnerId })
      .from(cpLeadAttributions)
      .where(and(eq(cpLeadAttributions.tenantId, tenantId), eq(cpLeadAttributions.leadId, params.leadId)))
      .limit(1);
    if (!attribution) return null;

    const [partner] = await tx
      .select({ commissionPercentage: channelPartners.commissionPercentage })
      .from(channelPartners)
      .where(and(eq(channelPartners.tenantId, tenantId), eq(channelPartners.id, attribution.channelPartnerId)))
      .limit(1);
    if (!partner) return null;

    const pct = Number(partner.commissionPercentage || 0);
    const bookingAmount = roundMoney(Number(params.dealTotal || 0));
    const incentiveAmount = roundMoney((bookingAmount * pct) / 100);

    const id = randomUUID();
    const now = new Date();
    await tx.insert(cpIncentives).values({
      id,
      tenantId,
      channelPartnerId: attribution.channelPartnerId,
      dealId: params.dealId,
      bookingAmount: bookingAmount.toString(),
      incentivePercentage: pct.toString(),
      incentiveAmount: incentiveAmount.toString(),
      status: 'accrued',
      createdAt: now,
      updatedAt: now
    });
    return { id, incentiveAmount };
  }

  private async ensurePartnerExists(tenantId: string, partnerId: string) {
    const [row] = await this.db
      .select()
      .from(channelPartners)
      .where(and(eq(channelPartners.tenantId, tenantId), eq(channelPartners.id, partnerId)))
      .limit(1);
    if (!row) throw new NotFoundException('Channel partner not found');
    return row;
  }
}
