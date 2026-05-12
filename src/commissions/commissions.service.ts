import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { commissions } from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  CommissionListQueryDto,
  CreateCommissionDto,
  UpdateCommissionDto
} from './commissions.dto';

@Injectable()
export class CommissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async create(tenantId: string, dto: CreateCommissionDto, createdByUserId?: string | null) {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(commissions).values({
      id,
      tenantId,
      dealId: dto.dealId ?? null,
      leadId: dto.leadId ?? null,
      agentUserId: dto.agentUserId,
      type: dto.type,
      percentageRate: dto.percentageRate != null ? String(dto.percentageRate) : null,
      fixedAmount: dto.fixedAmount != null ? String(dto.fixedAmount) : null,
      totalAmount: String(dto.totalAmount),
      status: 'pending',
      notes: dto.notes ?? null,
      approvedByUserId: null,
      approvedAt: null,
      paidAt: null,
      invoiceNumber: null,
      createdByUserId: createdByUserId ?? null,
      createdAt: now,
      updatedAt: now
    });

    return this.findOne(tenantId, id);
  }

  async findAll(tenantId: string, query: CommissionListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(commissions.tenantId, tenantId)];
    if (query.agentUserId) baseFilters.push(eq(commissions.agentUserId, query.agentUserId));
    if (query.status) baseFilters.push(eq(commissions.status, query.status));
    if (query.dealId) baseFilters.push(eq(commissions.dealId, query.dealId));

    const whereClause = PaginationUtil.buildFilters(baseFilters);

    const allowedSortFields = {
      totalAmount: commissions.totalAmount,
      createdAt: commissions.createdAt,
      updatedAt: commissions.updatedAt,
      paidAt: commissions.paidAt,
      approvedAt: commissions.approvedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      commissions.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(commissions)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(commissions)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async findOne(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(commissions)
      .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, id)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Commission with id ${id} not found`);
    }

    return row;
  }

  async update(tenantId: string, id: string, dto: UpdateCommissionDto) {
    await this.findOne(tenantId, id);

    await this.db
      .update(commissions)
      .set({
        ...(dto.dealId !== undefined && { dealId: dto.dealId }),
        ...(dto.leadId !== undefined && { leadId: dto.leadId }),
        ...(dto.agentUserId !== undefined && { agentUserId: dto.agentUserId }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.percentageRate !== undefined && { percentageRate: String(dto.percentageRate) }),
        ...(dto.fixedAmount !== undefined && { fixedAmount: String(dto.fixedAmount) }),
        ...(dto.totalAmount !== undefined && { totalAmount: String(dto.totalAmount) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedAt: new Date()
      })
      .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, id)));

    return this.findOne(tenantId, id);
  }

  async approve(tenantId: string, id: string, approvedByUserId: string) {
    await this.findOne(tenantId, id);

    const now = new Date();

    await this.db
      .update(commissions)
      .set({
        status: 'approved',
        approvedByUserId,
        approvedAt: now,
        updatedAt: now
      })
      .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, id)));

    return this.findOne(tenantId, id);
  }

  async markPaid(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const now = new Date();

    await this.db
      .update(commissions)
      .set({
        status: 'paid',
        paidAt: now,
        updatedAt: now
      })
      .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, id)));

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.db
      .delete(commissions)
      .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, id)));

    return { success: true, id };
  }
}
