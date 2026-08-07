import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  bookingMilestones,
  bookingPayments,
  bookings,
  leads,
  propertyEntities,
  propertyUnits
} from '../database/schema';
import { roundMoney } from '../common/utils/cost-sheet.util';

/** Aging buckets, in days overdue. */
export const AGING_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface OutstandingRow {
  bookingId: string;
  bookingNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  unitCode: string | null;
  projectName: string | null;
  totalValue: number;
  received: number;
  outstanding: number;
  /** Instalments already due but unpaid. The number that actually matters. */
  overdueAmount: number;
  daysOverdue: number;
  bucket: AgingBucket;
  nextDueLabel: string | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
}

/**
 * Answers "who owes us money, and how late are they?".
 *
 * Collections is where a builder's cash actually lives, and it was previously
 * unanswerable: milestones existed but nothing compared them against the
 * ledger. Everything here derives from `booking_payments`; nothing is stored.
 */
@Injectable()
export class CollectionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  private bucketFor(daysOverdue: number): AgingBucket {
    if (daysOverdue <= 0) return 'current';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
  }

  /**
   * Outstanding position for every live booking, newest arrears first.
   *
   * Cancelled and draft bookings are excluded: neither represents money the
   * builder can chase.
   */
  async listOutstanding(
    tenantId: string,
    options: { bucket?: AgingBucket; onlyOverdue?: boolean } = {}
  ): Promise<{ rows: OutstandingRow[]; totals: Record<string, number> }> {
    const rows = await this.db
      .select({
        booking: bookings,
        leadName: leads.name,
        leadPhone: leads.phone,
        unitCode: propertyUnits.unitCode,
        projectName: propertyEntities.name
      })
      .from(bookings)
      .leftJoin(leads, eq(bookings.leadId, leads.id))
      .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
      .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          inArray(bookings.status, ['confirmed', 'completed'])
        )
      );

    if (!rows.length) {
      return { rows: [], totals: this.emptyTotals() };
    }

    const bookingIds = rows.map((r) => r.booking.id);

    const milestones = await this.db
      .select()
      .from(bookingMilestones)
      .where(
        and(
          eq(bookingMilestones.tenantId, tenantId),
          inArray(bookingMilestones.bookingId, bookingIds)
        )
      )
      .orderBy(asc(bookingMilestones.sortOrder));

    const milestonesByBooking = milestones.reduce<Record<string, typeof milestones>>(
      (acc, m) => {
        (acc[m.bookingId] ??= [] as any).push(m);
        return acc;
      },
      {}
    );

    const now = new Date();
    const result: OutstandingRow[] = [];

    for (const row of rows) {
      const totalValue = roundMoney(Number(row.booking.bookingAmount ?? 0));
      const received = roundMoney(Number(row.booking.paidAmount ?? 0));
      const outstanding = roundMoney(Math.max(totalValue - received, 0));

      const bookingMilestoneRows = milestonesByBooking[row.booking.id] ?? [];

      // Overdue = instalments whose due date has passed and which are not
      // fully paid. Milestone status is maintained by recalcBookingFinancials.
      const overdue = bookingMilestoneRows.filter(
        (m) => m.dueDate && new Date(m.dueDate) < now && m.status !== 'paid'
      );

      const overdueAmount = roundMoney(
        overdue.reduce((total, m) => total + Number(m.amount ?? 0), 0)
      );

      const oldestOverdue = overdue.length
        ? overdue.reduce((oldest, m) =>
            new Date(m.dueDate!) < new Date(oldest.dueDate!) ? m : oldest
          )
        : null;

      const daysOverdue = oldestOverdue
        ? Math.floor((now.getTime() - new Date(oldestOverdue.dueDate!).getTime()) / 86_400_000)
        : 0;

      const nextDue =
        bookingMilestoneRows.find((m) => m.status !== 'paid' && m.dueDate) ??
        bookingMilestoneRows.find((m) => m.status !== 'paid') ??
        null;

      const bucket = this.bucketFor(daysOverdue);

      if (options.onlyOverdue && overdueAmount <= 0) continue;
      if (options.bucket && bucket !== options.bucket) continue;

      result.push({
        bookingId: row.booking.id,
        bookingNumber: row.booking.bookingNumber,
        customerName: row.leadName ?? null,
        customerPhone: row.leadPhone ?? null,
        unitCode: row.unitCode ?? null,
        projectName: row.projectName ?? null,
        totalValue,
        received,
        outstanding,
        overdueAmount,
        daysOverdue,
        bucket,
        nextDueLabel: nextDue?.label ?? null,
        nextDueDate: nextDue?.dueDate ? new Date(nextDue.dueDate).toISOString() : null,
        nextDueAmount: nextDue ? roundMoney(Number(nextDue.amount ?? 0)) : null
      });
    }

    result.sort((a, b) => b.daysOverdue - a.daysOverdue || b.overdueAmount - a.overdueAmount);

    const totals = result.reduce(
      (acc, r) => {
        acc[r.bucket] = roundMoney((acc[r.bucket] ?? 0) + r.overdueAmount);
        acc.totalOutstanding = roundMoney(acc.totalOutstanding + r.outstanding);
        acc.totalOverdue = roundMoney(acc.totalOverdue + r.overdueAmount);
        return acc;
      },
      this.emptyTotals()
    );

    return { rows: result, totals };
  }

  private emptyTotals(): Record<string, number> {
    return {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0,
      totalOutstanding: 0,
      totalOverdue: 0
    };
  }

  /**
   * Full money picture for one booking: the ledger, the schedule, and what is
   * left. This is what a collections agent looks at before making the call.
   */
  async getBookingLedger(tenantId: string, bookingId: string) {
    const [booking] = await this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);

    if (!booking) return null;

    const [milestones, payments] = await Promise.all([
      this.db
        .select()
        .from(bookingMilestones)
        .where(
          and(
            eq(bookingMilestones.tenantId, tenantId),
            eq(bookingMilestones.bookingId, bookingId)
          )
        )
        .orderBy(asc(bookingMilestones.sortOrder)),
      this.db
        .select()
        .from(bookingPayments)
        .where(
          and(eq(bookingPayments.tenantId, tenantId), eq(bookingPayments.bookingId, bookingId))
        )
        .orderBy(asc(bookingPayments.paymentDate))
    ]);

    const cleared = payments.filter((p) => p.status === 'cleared');
    const received = roundMoney(cleared.reduce((t, p) => t + Number(p.amount ?? 0), 0));
    const totalValue = roundMoney(Number(booking.bookingAmount ?? 0));
    const now = new Date();

    // Money allocated to a milestone, so the schedule shows part-payments.
    const paidByMilestone = cleared.reduce<Record<string, number>>((acc, p) => {
      if (!p.milestoneId) return acc;
      acc[p.milestoneId] = roundMoney((acc[p.milestoneId] ?? 0) + Number(p.amount ?? 0));
      return acc;
    }, {});

    const schedule = milestones.map((m) => {
      const due = roundMoney(Number(m.amount ?? 0));
      const paid = paidByMilestone[m.id] ?? 0;
      const isOverdue = !!m.dueDate && new Date(m.dueDate) < now && m.status !== 'paid';
      return {
        id: m.id,
        label: m.label,
        dueDate: m.dueDate,
        amount: due,
        paid,
        balance: roundMoney(Math.max(due - paid, 0)),
        status: m.status,
        isOverdue,
        daysOverdue:
          isOverdue && m.dueDate
            ? Math.floor((now.getTime() - new Date(m.dueDate).getTime()) / 86_400_000)
            : 0
      };
    });

    return {
      booking,
      summary: {
        totalValue,
        received,
        outstanding: roundMoney(Math.max(totalValue - received, 0)),
        overdueAmount: roundMoney(
          schedule.filter((s) => s.isOverdue).reduce((t, s) => t + s.balance, 0)
        ),
        // Unallocated money sits against the booking but no instalment — common
        // when a token is taken before the plan is drawn up.
        unallocated: roundMoney(
          cleared.filter((p) => !p.milestoneId).reduce((t, p) => t + Number(p.amount ?? 0), 0)
        )
      },
      schedule,
      payments
    };
  }

  /** Tenant-wide collections headline for the dashboard. */
  async getCollectionsSummary(tenantId: string) {
    const [row] = await this.db
      .select({
        totalBooked: sql<string>`COALESCE(SUM(CAST(${bookings.bookingAmount} AS NUMERIC)), 0)`,
        totalReceived: sql<string>`COALESCE(SUM(CAST(${bookings.paidAmount} AS NUMERIC)), 0)`,
        liveBookings: sql<number>`COUNT(*)`
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          inArray(bookings.status, ['confirmed', 'completed'])
        )
      );

    const totalBooked = roundMoney(Number(row?.totalBooked ?? 0));
    const totalReceived = roundMoney(Number(row?.totalReceived ?? 0));
    const { totals } = await this.listOutstanding(tenantId);

    return {
      totalBooked,
      totalReceived,
      totalOutstanding: roundMoney(Math.max(totalBooked - totalReceived, 0)),
      totalOverdue: totals.totalOverdue,
      liveBookings: Number(row?.liveBookings ?? 0),
      aging: {
        current: totals.current,
        '1-30': totals['1-30'],
        '31-60': totals['31-60'],
        '61-90': totals['61-90'],
        '90+': totals['90+']
      }
    };
  }
}
