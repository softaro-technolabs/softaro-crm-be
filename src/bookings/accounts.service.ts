import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  bookingMilestones,
  bookingPayments,
  bookings,
  channelPartners,
  commissions,
  leads,
  propertyEntities,
  propertyUnits
} from '../database/schema';
import { roundMoney } from '../common/utils/cost-sheet.util';
import { PaginationUtil } from '../common/utils/pagination.util';

/**
 * The accounting view of the business: every receipt, every payable, and what
 * is left over.
 *
 * Payments were previously only reachable one booking at a time, and the
 * Payments screen was a static mock. Nothing anywhere answered "how much did we
 * collect this month, and how much of it is owed out as commission?".
 */
@Injectable()
export class AccountsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  /**
   * Every payment across every booking, newest first — the receipt register.
   */
  async listPayments(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      paymentMethod?: string;
      bookingId?: string;
      from?: string;
      to?: string;
    }
  ) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters = [eq(bookingPayments.tenantId, tenantId)];
    if (query.status) filters.push(eq(bookingPayments.status, query.status));
    if (query.paymentMethod) filters.push(eq(bookingPayments.paymentMethod, query.paymentMethod));
    if (query.bookingId) filters.push(eq(bookingPayments.bookingId, query.bookingId));
    if (query.from) filters.push(gte(bookingPayments.paymentDate, new Date(query.from)));
    if (query.to) filters.push(lte(bookingPayments.paymentDate, new Date(query.to)));

    const where = and(...filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          payment: bookingPayments,
          bookingNumber: bookings.bookingNumber,
          bookingId: bookings.id,
          customerName: leads.name,
          customerPhone: leads.phone,
          unitCode: propertyUnits.unitCode,
          projectName: propertyEntities.name,
          milestoneLabel: bookingMilestones.label
        })
        .from(bookingPayments)
        .leftJoin(bookings, eq(bookingPayments.bookingId, bookings.id))
        .leftJoin(leads, eq(bookings.leadId, leads.id))
        .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
        .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
        .leftJoin(bookingMilestones, eq(bookingPayments.milestoneId, bookingMilestones.id))
        .where(where)
        .orderBy(desc(bookingPayments.paymentDate))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(bookingPayments)
        .where(where)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  /**
   * The headline P&L-ish picture: collected, still owed, and what of the
   * collected money is already committed to commissions.
   */
  async getAccountsSummary(tenantId: string, period?: { from?: string; to?: string }) {
    const from = period?.from ? new Date(period.from) : null;
    const to = period?.to ? new Date(period.to) : null;

    const periodFilters = [
      eq(bookingPayments.tenantId, tenantId),
      eq(bookingPayments.status, 'cleared')
    ];
    if (from) periodFilters.push(gte(bookingPayments.paymentDate, from));
    if (to) periodFilters.push(lte(bookingPayments.paymentDate, to));

    const [
      collectedPeriodRow,
      collectedAllRow,
      bookedRow,
      byMethodRows,
      bouncedRow,
      commissionRows
    ] = await Promise.all([
      this.db
        .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
        .from(bookingPayments)
        .where(and(...periodFilters)),

      this.db
        .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
        .from(bookingPayments)
        .where(
          and(eq(bookingPayments.tenantId, tenantId), eq(bookingPayments.status, 'cleared'))
        ),

      this.db
        .select({
          total: sql<string>`COALESCE(SUM(CAST(${bookings.bookingAmount} AS NUMERIC)), 0)`,
          count: sql<number>`COUNT(*)`
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.tenantId, tenantId),
            inArray(bookings.status, ['confirmed', 'completed'])
          )
        ),

      this.db
        .select({
          method: bookingPayments.paymentMethod,
          total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)`,
          count: sql<number>`COUNT(*)`
        })
        .from(bookingPayments)
        .where(and(...periodFilters))
        .groupBy(bookingPayments.paymentMethod),

      this.db
        .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
        .from(bookingPayments)
        .where(
          and(
            eq(bookingPayments.tenantId, tenantId),
            inArray(bookingPayments.status, ['bounced', 'reversed'])
          )
        ),

      this.db
        .select({
          status: commissions.status,
          total: sql<string>`COALESCE(SUM(${commissions.totalAmount}), 0)`
        })
        .from(commissions)
        .where(eq(commissions.tenantId, tenantId))
        .groupBy(commissions.status)
    ]);

    const collectedPeriod = roundMoney(Number(collectedPeriodRow[0]?.total ?? 0));
    const collectedAll = roundMoney(Number(collectedAllRow[0]?.total ?? 0));
    const totalBooked = roundMoney(Number(bookedRow[0]?.total ?? 0));

    // Commission is channel-partner only; internal staff are paid via payroll.
    const commissionTotals = commissionRows.reduce(
      (acc, row) => {
        const amount = roundMoney(Number(row.total ?? 0));
        acc.total = roundMoney(acc.total + amount);
        if (row.status === 'paid') acc.paid = roundMoney(acc.paid + amount);
        else if (row.status === 'approved') acc.approved = roundMoney(acc.approved + amount);
        else if (row.status !== 'cancelled') acc.pending = roundMoney(acc.pending + amount);
        return acc;
      },
      { total: 0, paid: 0, approved: 0, pending: 0 }
    );

    return {
      collectedPeriod,
      collectedAll,
      totalBooked,
      liveBookings: Number(bookedRow[0]?.count ?? 0),
      receivable: roundMoney(Math.max(totalBooked - collectedAll, 0)),
      bouncedOrReversed: roundMoney(Number(bouncedRow[0]?.total ?? 0)),
      commissions: {
        ...commissionTotals,
        /** Approved plus pending — everything still owed to partners. */
        outstanding: roundMoney(commissionTotals.approved + commissionTotals.pending)
      },
      /** Collected money that is not already spoken for by a commission. */
      netAfterCommission: roundMoney(collectedAll - commissionTotals.total),
      byMethod: byMethodRows.map((row) => ({
        method: row.method,
        total: roundMoney(Number(row.total ?? 0)),
        count: Number(row.count ?? 0)
      }))
    };
  }

  /**
   * Commissions with the payee resolved and the earned portion computed.
   *
   * `totalAmount` is what the booking would earn in full; `earnedAmount` is the
   * share justified by money actually collected. Paying the full amount on a
   * booking that is 10% collected is how builders lose money on cancellations.
   */
  async listCommissions(
    tenantId: string,
    query: { page?: number; limit?: number; status?: string }
  ) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters = [eq(commissions.tenantId, tenantId)];
    if (query.status) filters.push(eq(commissions.status, query.status as any));
    const where = and(...filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          commission: commissions,
          partnerName: channelPartners.name,
          partnerFirm: channelPartners.firmName,
          bookingNumber: bookings.bookingNumber,
          bookingAmount: bookings.bookingAmount,
          bookingPaid: bookings.paidAmount,
          bookingStatus: bookings.status,
          customerName: leads.name,
          unitCode: propertyUnits.unitCode
        })
        .from(commissions)
        .leftJoin(channelPartners, eq(commissions.channelPartnerId, channelPartners.id))
        .leftJoin(bookings, eq(commissions.bookingId, bookings.id))
        .leftJoin(leads, eq(commissions.leadId, leads.id))
        .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
        .where(where)
        .orderBy(desc(commissions.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(commissions).where(where)
    ]);

    const enriched = rows.map((row) => {
      const total = roundMoney(Number(row.commission.totalAmount ?? 0));
      const bookingValue = roundMoney(Number(row.bookingAmount ?? 0));
      const collected = roundMoney(Number(row.bookingPaid ?? 0));
      const collectionRatio = bookingValue > 0 ? Math.min(collected / bookingValue, 1) : 0;

      return {
        ...row.commission,
        payeeName: row.partnerFirm ?? row.partnerName ?? 'Unknown partner',
        partnerName: row.partnerName,
        bookingNumber: row.bookingNumber,
        customerName: row.customerName,
        unitCode: row.unitCode,
        bookingStatus: row.bookingStatus,
        bookingValue,
        collected,
        collectionPercent: Math.round(collectionRatio * 100),
        totalAmount: total,
        earnedAmount: roundMoney(total * collectionRatio),
        unearnedAmount: roundMoney(total - total * collectionRatio)
      };
    });

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(enriched, total, page, limit);
  }
}
