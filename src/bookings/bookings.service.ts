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
  deals,
  leadActivities,
  leads,
  propertyEntities,
  propertyStatusLogs,
  propertyUnits,
  users
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  type BookingStatus,
  BookingListQueryDto,
  CreateBookingDto,
  UpdateBookingDto
} from './bookings.dto';

@Injectable()
export class BookingsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async listBookings(tenantId: string, query: BookingListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(bookings.tenantId, tenantId)];
    if (query.status) baseFilters.push(eq(bookings.status, query.status));
    if (query.dealId) baseFilters.push(eq(bookings.dealId, query.dealId));

    const searchFilter = query.search
      ? or(
          sql`${bookings.bookingNumber} ILIKE ${`%${query.search}%`}`,
          sql`${deals.dealNumber} ILIKE ${`%${query.search}%`}`,
          sql`${leads.name} ILIKE ${`%${query.search}%`}`,
          sql`${propertyUnits.unitCode} ILIKE ${`%${query.search}%`}`
        )
      : null;

    const filters = [...baseFilters];
    if (searchFilter) filters.push(searchFilter);
    const whereClause = PaginationUtil.buildFilters(filters);

    const allowedSortFields = {
      bookingNumber: bookings.bookingNumber,
      bookingDate: bookings.bookingDate,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      bookingAmount: bookings.bookingAmount,
      paidAmount: bookings.paidAmount
    };

    const orderBy = PaginationUtil.buildOrderBy(
      bookings.bookingDate,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          booking: bookings,
          deal: {
            id: deals.id,
            dealNumber: deals.dealNumber,
            status: deals.status
          },
          lead: {
            id: leads.id,
            name: leads.name,
            email: leads.email,
            phone: leads.phone
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
          }
        })
        .from(bookings)
        .leftJoin(deals, eq(bookings.dealId, deals.id))
        .leftJoin(leads, eq(bookings.leadId, leads.id))
        .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
        .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(bookings).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getBooking(tenantId: string, bookingId: string) {
    const [row] = await this.db
      .select({
        booking: bookings,
        deal: deals,
        lead: {
          id: leads.id,
          name: leads.name,
          email: leads.email,
          phone: leads.phone
        },
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
        createdBy: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(bookings)
      .leftJoin(deals, eq(bookings.dealId, deals.id))
      .leftJoin(leads, eq(bookings.leadId, leads.id))
      .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
      .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
      .leftJoin(users, eq(bookings.createdByUserId, users.id))
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);

    if (!row) throw new NotFoundException('Booking not found');
    return row;
  }

  async createBooking(tenantId: string, dto: CreateBookingDto, createdByUserId?: string | null) {
    const resolved = await this.resolveBookingRelations(tenantId, dto);

    const bookingAmount = Number(dto.bookingAmount ?? resolved.deal?.pendingAmount ?? 0);
    const paidAmount = Number(dto.paidAmount ?? 0);
    if (paidAmount > bookingAmount) {
      throw new BadRequestException('Paid amount cannot be greater than booking amount');
    }

    const bookingId = randomUUID();
    const bookingNumber = await this.generateBookingNumber(tenantId);
    const status = dto.status ?? 'draft';
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.insert(bookings).values({
        id: bookingId,
        tenantId,
        dealId: resolved.deal?.id ?? null,
        leadId: resolved.leadId,
        propertyUnitId: resolved.propertyUnitId,
        bookingNumber,
        bookingDate: new Date(dto.bookingDate),
        bookingAmount: bookingAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        status,
        notes: dto.notes ?? null,
        createdByUserId: createdByUserId ?? null,
        createdAt: now,
        updatedAt: now
      });

      if (resolved.deal?.id) {
        await this.syncDealFromBooking(tx, tenantId, resolved.deal.id, {
          bookingStatus: status,
          paidAmount,
          bookingAmount
        });
      }

      if (resolved.propertyUnitId) {
        const unitStatus = status === 'cancelled' ? 'available' : status === 'draft' ? 'blocked' : 'booked';
        await this.syncUnitStatus(tx, tenantId, resolved.propertyUnitId, unitStatus, createdByUserId, `Synced from booking ${bookingNumber}`);
      }

      if (resolved.leadId) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: resolved.leadId,
          type: 'note',
          title: `Booking created: ${bookingNumber}`,
          note: dto.notes ?? `Booking status: ${status}`,
          metadata: { bookingId, bookingNumber, dealId: resolved.deal?.id ?? null },
          happenedAt: now,
          createdByUserId: createdByUserId ?? null,
          createdAt: now
        });
      }
    });

    return this.getBooking(tenantId, bookingId);
  }

  async updateBooking(tenantId: string, bookingId: string, dto: UpdateBookingDto, updatedByUserId?: string | null) {
    const existing = await this.getBooking(tenantId, bookingId);
    const bookingAmount = dto.bookingAmount !== undefined ? Number(dto.bookingAmount) : Number(existing.booking.bookingAmount ?? 0);
    const paidAmount = dto.paidAmount !== undefined ? Number(dto.paidAmount) : Number(existing.booking.paidAmount ?? 0);
    if (paidAmount > bookingAmount) {
      throw new BadRequestException('Paid amount cannot be greater than booking amount');
    }

    const status = dto.status ?? existing.booking.status;

    await this.db.transaction(async (tx) => {
      await tx.update(bookings)
        .set({
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : existing.booking.bookingDate,
          bookingAmount: bookingAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          status,
          notes: dto.notes !== undefined ? dto.notes : existing.booking.notes,
          updatedAt: new Date()
        })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));

      if (existing.booking.dealId) {
        await this.syncDealFromBooking(tx, tenantId, existing.booking.dealId, {
          bookingStatus: status,
          paidAmount,
          bookingAmount
        });
      }

      if (existing.booking.propertyUnitId) {
        const unitStatus = status === 'cancelled' ? 'available' : status === 'draft' ? 'blocked' : 'booked';
        await this.syncUnitStatus(tx, tenantId, existing.booking.propertyUnitId, unitStatus, updatedByUserId, `Synced from booking ${existing.booking.bookingNumber}`);
      }
    });

    return this.getBooking(tenantId, bookingId);
  }

  async deleteBooking(tenantId: string, bookingId: string, updatedByUserId?: string | null) {
    const existing = await this.getBooking(tenantId, bookingId);

    await this.db.transaction(async (tx) => {
      await tx.delete(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));

      if (existing.booking.dealId) {
        await tx.update(deals)
          .set({ status: 'on_hold', updatedAt: new Date() })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, existing.booking.dealId)));
      }

      if (existing.booking.propertyUnitId) {
        await this.syncUnitStatus(tx, tenantId, existing.booking.propertyUnitId, 'available', updatedByUserId, 'Booking deleted');
      }
    });

    return { success: true };
  }

  private async resolveBookingRelations(tenantId: string, dto: CreateBookingDto) {
    let deal: typeof deals.$inferSelect | null = null;
    if (dto.dealId) {
      const [existingDeal] = await this.db
        .select()
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dto.dealId)))
        .limit(1);
      if (!existingDeal) throw new NotFoundException('Deal not found');
      deal = existingDeal;
    }

    const leadId = dto.leadId ?? deal?.leadId ?? null;
    const propertyUnitId = dto.propertyUnitId ?? deal?.propertyUnitId ?? null;

    if (!leadId) throw new BadRequestException('Lead is required to create a booking');
    if (!propertyUnitId) throw new BadRequestException('Property unit is required to create a booking');

    const [lead] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);
    if (!lead) throw new NotFoundException('Lead not found');

    const [unit] = await this.db
      .select({ id: propertyUnits.id })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, propertyUnitId)))
      .limit(1);
    if (!unit) throw new NotFoundException('Property unit not found');

    return { deal, leadId, propertyUnitId };
  }

  private async generateBookingNumber(tenantId: string) {
    const [countResult] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.tenantId, tenantId));

    return `BK-${new Date().getFullYear()}-${(Number(countResult?.value || 0) + 1).toString().padStart(4, '0')}`;
  }

  private async syncDealFromBooking(
    tx: DrizzleDatabase | Parameters<DrizzleDatabase['transaction']>[0],
    tenantId: string,
    dealId: string,
    input: { bookingStatus: BookingStatus; paidAmount: number; bookingAmount: number }
  ) {
    const [deal] = await (tx as DrizzleDatabase)
      .select()
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId)))
      .limit(1);

    if (!deal) return;

    const receivedAmount = Math.max(Number(deal.receivedAmount ?? 0), input.paidAmount);
    const pendingAmount = Math.max(Number(deal.totalAmount ?? 0) - receivedAmount, 0);

    let status: typeof deals.$inferInsert.status = pendingAmount <= 0 ? 'closed_won' : 'pending_payment';
    if (input.bookingStatus === 'cancelled') status = 'on_hold';
    if (input.bookingStatus === 'draft' && status !== 'closed_won') status = 'active';

    await (tx as DrizzleDatabase).update(deals)
      .set({
        status,
        receivedAmount: receivedAmount.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        actualClosingDate: status === 'closed_won' ? new Date() : deal.actualClosingDate,
        updatedAt: new Date()
      })
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dealId)));
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

    await (tx as DrizzleDatabase).update(propertyUnits)
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
