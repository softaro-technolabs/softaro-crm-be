import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  bookings,
  contacts,
  deals,
  leadActivities,
  leads,
  propertyEntities,
  propertyStatusLogs,
  propertyUnits,
  quotations,
  users
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  ConvertLeadToDealDto,
  CreateDealDto,
  DealListQueryDto,
  type DealStatus,
  UpdateDealDto
} from './deals.dto';

@Injectable()
export class DealsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async listDeals(tenantId: string, query: DealListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(deals.tenantId, tenantId)];
    if (query.status) baseFilters.push(eq(deals.status, query.status));
    if (query.leadId) baseFilters.push(eq(deals.leadId, query.leadId));
    if (query.assignedToUserId) baseFilters.push(eq(deals.assignedToUserId, query.assignedToUserId));

    const searchFilter = query.search
      ? or(
          sql`${deals.dealNumber} ILIKE ${`%${query.search}%`}`,
          sql`${leads.name} ILIKE ${`%${query.search}%`}`,
          sql`${contacts.name} ILIKE ${`%${query.search}%`}`,
          sql`${propertyUnits.unitCode} ILIKE ${`%${query.search}%`}`
        )
      : null;

    const filters = [...baseFilters];
    if (searchFilter) filters.push(searchFilter);
    const whereClause = PaginationUtil.buildFilters(filters);

    const allowedSortFields = {
      dealNumber: deals.dealNumber,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      totalAmount: deals.totalAmount,
      receivedAmount: deals.receivedAmount,
      pendingAmount: deals.pendingAmount,
      expectedClosingDate: deals.expectedClosingDate
    };

    const orderBy = PaginationUtil.buildOrderBy(
      deals.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          deal: deals,
          lead: {
            id: leads.id,
            name: leads.name,
            email: leads.email,
            phone: leads.phone
          },
          contact: {
            id: contacts.id,
            name: contacts.name,
            email: contacts.email,
            phone: contacts.phone
          },
          propertyUnit: {
            id: propertyUnits.id,
            unitCode: propertyUnits.unitCode,
            unitStatus: propertyUnits.unitStatus,
            price: propertyUnits.price
          },
          propertyEntity: {
            id: propertyEntities.id,
            name: propertyEntities.name,
            entityType: propertyEntities.entityType
          },
          assignee: {
            id: users.id,
            name: users.name,
            email: users.email
          }
        })
        .from(deals)
        .leftJoin(leads, eq(deals.leadId, leads.id))
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .leftJoin(propertyUnits, eq(deals.propertyUnitId, propertyUnits.id))
        .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
        .leftJoin(users, eq(deals.assignedToUserId, users.id))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(deals).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getDeal(tenantId: string, dealId: string) {
    const [row] = await this.db
      .select({
        deal: deals,
        lead: {
          id: leads.id,
          name: leads.name,
          email: leads.email,
          phone: leads.phone
        },
        contact: contacts,
        propertyUnit: {
          id: propertyUnits.id,
          unitCode: propertyUnits.unitCode,
          unitStatus: propertyUnits.unitStatus,
          price: propertyUnits.price,
          pricePerSqft: propertyUnits.pricePerSqft
        },
        propertyEntity: {
          id: propertyEntities.id,
          name: propertyEntities.name,
          entityType: propertyEntities.entityType
        },
        quotation: {
          id: quotations.id,
          quotationNumber: quotations.quotationNumber,
          title: quotations.title,
          status: quotations.status
        },
        assignee: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(deals)
      .leftJoin(leads, eq(deals.leadId, leads.id))
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .leftJoin(propertyUnits, eq(deals.propertyUnitId, propertyUnits.id))
      .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
      .leftJoin(quotations, eq(deals.quotationId, quotations.id))
      .leftJoin(users, eq(deals.assignedToUserId, users.id))
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Deal not found');
    }

    const bookingRows = await this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.dealId, dealId)))
      .orderBy(desc(bookings.createdAt));

    return {
      ...row,
      bookings: bookingRows
    };
  }

  async createDeal(tenantId: string, dto: CreateDealDto, createdByUserId?: string | null) {
    const lead = await this.getLeadOrThrow(tenantId, dto.leadId);

    if (dto.propertyUnitId) {
      await this.getUnitOrThrow(tenantId, dto.propertyUnitId);
    }

    const contactId = await this.ensureContactForLead(tenantId, lead.id, {
      name: lead.name,
      email: lead.email,
      phone: lead.phone
    });

    const dealId = randomUUID();
    const dealNumber = await this.generateDealNumber(tenantId);
    const totalAmount = await this.resolveDealTotalAmount(tenantId, dto.totalAmount, dto.propertyUnitId, dto.quotationId);
    const receivedAmount = Number(dto.receivedAmount ?? 0);
    const pendingAmount = Math.max(totalAmount - receivedAmount, 0);
    const status = this.resolveDealStatus('active', pendingAmount);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.insert(deals).values({
        id: dealId,
        tenantId,
        leadId: lead.id,
        contactId,
        quotationId: dto.quotationId ?? null,
        propertyUnitId: dto.propertyUnitId ?? null,
        dealNumber,
        status,
        expectedClosingDate: dto.expectedClosingDate ? new Date(dto.expectedClosingDate) : null,
        totalAmount: totalAmount.toFixed(2),
        receivedAmount: receivedAmount.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        assignedToUserId: dto.assignedToUserId ?? lead.assignedToUserId ?? null,
        notes: dto.notes ?? null,
        metadata: null,
        createdAt: now,
        updatedAt: now
      });

      if (dto.propertyUnitId) {
        await this.syncUnitStatus(tx, tenantId, dto.propertyUnitId, 'blocked', createdByUserId, 'Blocked for active deal');
      }

      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId: lead.id,
        type: 'note',
        title: `Deal created: ${dealNumber}`,
        note: dto.notes ?? 'Lead converted into an active deal.',
        metadata: { dealId, dealNumber },
        happenedAt: now,
        createdByUserId: createdByUserId ?? null,
        createdAt: now
      });
    });

    return this.getDeal(tenantId, dealId);
  }

  async convertLeadToDeal(tenantId: string, leadId: string, dto: ConvertLeadToDealDto, createdByUserId?: string | null) {
    const existing = await this.db
      .select({ id: deals.id, status: deals.status })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.leadId, leadId), eq(deals.status, 'active')))
      .limit(1);

    if (existing.length > 0) {
      throw new BadRequestException('An active deal already exists for this lead');
    }

    return this.createDeal(
      tenantId,
      {
        leadId,
        propertyUnitId: dto.propertyUnitId,
        quotationId: dto.quotationId,
        assignedToUserId: dto.assignedToUserId,
        totalAmount: dto.totalAmount,
        receivedAmount: dto.receivedAmount,
        expectedClosingDate: dto.expectedClosingDate,
        notes: dto.notes
      },
      createdByUserId
    );
  }

  async updateDeal(tenantId: string, dealId: string, dto: UpdateDealDto, updatedByUserId?: string | null) {
    const existing = await this.getDeal(tenantId, dealId);

    if (dto.propertyUnitId && dto.propertyUnitId !== existing.deal.propertyUnitId) {
      await this.getUnitOrThrow(tenantId, dto.propertyUnitId);
    }

    const totalAmount = dto.totalAmount !== undefined ? Number(dto.totalAmount) : Number(existing.deal.totalAmount ?? 0);
    const receivedAmount = dto.receivedAmount !== undefined ? Number(dto.receivedAmount) : Number(existing.deal.receivedAmount ?? 0);
    if (receivedAmount > totalAmount) {
      throw new BadRequestException('Received amount cannot be greater than total amount');
    }

    const pendingAmount = Math.max(totalAmount - receivedAmount, 0);
    const nextStatus = this.resolveDealStatus(dto.status ?? existing.deal.status, pendingAmount);

    const oldUnitId = existing.deal.propertyUnitId ?? null;
    const newUnitId = dto.propertyUnitId !== undefined ? dto.propertyUnitId : oldUnitId;

    await this.db.transaction(async (tx) => {
      await tx.update(deals)
        .set({
          status: nextStatus,
          propertyUnitId: newUnitId,
          assignedToUserId: dto.assignedToUserId !== undefined ? dto.assignedToUserId : existing.deal.assignedToUserId,
          totalAmount: totalAmount.toFixed(2),
          receivedAmount: receivedAmount.toFixed(2),
          pendingAmount: pendingAmount.toFixed(2),
          expectedClosingDate: dto.expectedClosingDate ? new Date(dto.expectedClosingDate) : existing.deal.expectedClosingDate,
          actualClosingDate: dto.actualClosingDate ? new Date(dto.actualClosingDate) : nextStatus === 'closed_won' ? (existing.deal.actualClosingDate ?? new Date()) : existing.deal.actualClosingDate,
          notes: dto.notes !== undefined ? dto.notes : existing.deal.notes,
          updatedAt: new Date()
        })
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId)));

      if (oldUnitId && oldUnitId !== newUnitId && nextStatus !== 'closed_won') {
        await this.syncUnitStatus(tx, tenantId, oldUnitId, 'available', updatedByUserId, 'Released from previous deal');
      }

      if (newUnitId) {
        const desiredStatus = nextStatus === 'closed_won' ? 'booked' : nextStatus === 'cancelled' || nextStatus === 'closed_lost' ? 'available' : 'blocked';
        await this.syncUnitStatus(tx, tenantId, newUnitId, desiredStatus, updatedByUserId, `Synced from deal ${existing.deal.dealNumber}`);
      }

      if (existing.deal.status !== nextStatus) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: existing.deal.leadId!,
          type: 'status_change',
          title: `Deal status updated: ${existing.deal.dealNumber}`,
          note: `${existing.deal.status} -> ${nextStatus}`,
          metadata: { dealId, dealNumber: existing.deal.dealNumber, oldStatus: existing.deal.status, newStatus: nextStatus },
          happenedAt: new Date(),
          createdByUserId: updatedByUserId ?? null,
          createdAt: new Date()
        });
      }
    });

    return this.getDeal(tenantId, dealId);
  }

  private async getLeadOrThrow(tenantId: string, leadId: string) {
    const [lead] = await this.db.select().from(leads).where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId))).limit(1);
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async getUnitOrThrow(tenantId: string, unitId: string) {
    const [unit] = await this.db
      .select()
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)))
      .limit(1);
    if (!unit) throw new NotFoundException('Property unit not found');
    return unit;
  }

  private async ensureContactForLead(
    tenantId: string,
    leadId: string,
    payload: { name: string | null; email: string | null; phone: string | null }
  ) {
    const [existing] = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.leadId, leadId)))
      .limit(1);

    if (existing) return existing.id;

    const id = randomUUID();
    await this.db.insert(contacts).values({
      id,
      tenantId,
      leadId,
      name: payload.name || 'Contact',
      email: payload.email,
      phone: payload.phone,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return id;
  }

  private async generateDealNumber(tenantId: string) {
    const [countResult] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(deals)
      .where(eq(deals.tenantId, tenantId));

    return `DL-${new Date().getFullYear()}-${(Number(countResult?.value || 0) + 1).toString().padStart(4, '0')}`;
  }

  private async resolveDealTotalAmount(tenantId: string, totalAmount?: number, propertyUnitId?: string, quotationId?: string) {
    if (typeof totalAmount === 'number') return totalAmount;

    if (quotationId) {
      const [quotation] = await this.db
        .select({ grandTotal: quotations.grandTotal })
        .from(quotations)
        .where(and(eq(quotations.tenantId, tenantId), eq(quotations.id, quotationId)))
        .limit(1);
      if (quotation?.grandTotal) return Number(quotation.grandTotal);
    }

    if (propertyUnitId) {
      const [unit] = await this.db
        .select({ price: propertyUnits.price })
        .from(propertyUnits)
        .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, propertyUnitId)))
        .limit(1);
      if (unit?.price) return Number(unit.price);
    }

    return 0;
  }

  private resolveDealStatus(status: DealStatus, pendingAmount: number): DealStatus {
    if (status === 'closed_won' || status === 'closed_lost' || status === 'cancelled' || status === 'on_hold') {
      return status;
    }
    return pendingAmount <= 0 ? 'closed_won' : status === 'active' ? 'active' : 'pending_payment';
  }

  private async syncUnitStatus(
    tx: DrizzleDatabase | Parameters<DrizzleDatabase['transaction']>[0],
    tenantId: string,
    unitId: string,
    status: 'available' | 'blocked' | 'booked' | 'sold',
    changedByUserId?: string | null,
    remarks?: string
  ) {
    const [current] = await (tx as DrizzleDatabase)
      .select({ unitStatus: propertyUnits.unitStatus })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)))
      .limit(1);

    if (!current || current.unitStatus === status) return;

    await (tx as DrizzleDatabase)
      .update(propertyUnits)
      .set({ unitStatus: status, updatedAt: new Date() })
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)));

    await (tx as DrizzleDatabase).insert(propertyStatusLogs).values({
      id: randomUUID(),
      tenantId,
      unitId,
      oldStatus: current.unitStatus,
      newStatus: status,
      changedByUserId: changedByUserId ?? null,
      changedAt: new Date(),
      remarks: remarks ?? null
    });
  }
}
