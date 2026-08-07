import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase, DrizzleTransaction } from '../database/database.types';
import {
  bookings,
  channelPartners,
  commissionSettings,
  commissions,
  cpLeadAttributions
} from '../database/schema';
import { roundMoney } from '../common/utils/cost-sheet.util';

/**
 * Accrues channel-partner commission when a booking goes live.
 *
 * Commission exists for channel partners only. Internal staff are paid through
 * payroll, not through this ledger, so there is deliberately no brokerage
 * accrual for an agent who owns a lead.
 *
 * `commissions` is the ONLY table involved. It is what both the back-office
 * Commissions screen and the partner portal read, so a partner can never see a
 * different status from the one your finance team set — the drift that a
 * separate `cp_incentives` table used to cause.
 */
@Injectable()
export class BookingCommissionsService {
  private readonly logger = new Logger(BookingCommissionsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  /** Tenant rates, created on first use so the table is never empty. */
  async getSettings(tenantId: string) {
    const [existing] = await this.db
      .select()
      .from(commissionSettings)
      .where(eq(commissionSettings.tenantId, tenantId))
      .limit(1);

    if (existing) return existing;

    const row = {
      tenantId,
      defaultPartnerPercentage: '0',
      earnOnCollection: true,
      updatedAt: new Date()
    };
    try {
      await this.db.insert(commissionSettings).values(row);
    } catch {
      // Concurrent first call — the primary key makes this safe to ignore.
    }
    return row as typeof commissionSettings.$inferSelect;
  }

  async updateSettings(
    tenantId: string,
    dto: { defaultPartnerPercentage?: number; earnOnCollection?: boolean }
  ) {
    await this.getSettings(tenantId);
    await this.db
      .update(commissionSettings)
      .set({
        ...(dto.defaultPartnerPercentage !== undefined && {
          defaultPartnerPercentage: String(dto.defaultPartnerPercentage)
        }),
        ...(dto.earnOnCollection !== undefined && { earnOnCollection: dto.earnOnCollection }),
        updatedAt: new Date()
      })
      .where(eq(commissionSettings.tenantId, tenantId));

    return this.getSettings(tenantId);
  }

  /**
   * Accrues the partner's commission for a booking.
   *
   * Idempotent: called on every confirm, and a booking that flips
   * confirmed → cancelled → confirmed must not pay anyone twice. Does nothing
   * when the lead was not sourced by a partner.
   */
  async accrueForBooking(
    tx: DrizzleTransaction,
    tenantId: string,
    bookingId: string,
    actorUserId?: string | null
  ) {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);

    if (!booking?.leadId) return;

    const bookingValue = roundMoney(Number(booking.bookingAmount ?? 0));
    if (bookingValue <= 0) return;

    const [attribution] = await tx
      .select({ channelPartnerId: cpLeadAttributions.channelPartnerId })
      .from(cpLeadAttributions)
      .where(
        and(eq(cpLeadAttributions.tenantId, tenantId), eq(cpLeadAttributions.leadId, booking.leadId))
      )
      .limit(1);

    // No partner sourced this lead — nothing is owed to anyone.
    if (!attribution) return;

    const [partner] = await tx
      .select({ commissionPercentage: channelPartners.commissionPercentage })
      .from(channelPartners)
      .where(
        and(
          eq(channelPartners.tenantId, tenantId),
          eq(channelPartners.id, attribution.channelPartnerId)
        )
      )
      .limit(1);

    if (!partner) return;

    const settings = await this.getSettings(tenantId);
    // The partner's own rate wins; the tenant default is the fallback so a
    // partner added without a rate still produces a payable rather than ₹0.
    const pct =
      Number(partner.commissionPercentage || 0) || Number(settings.defaultPartnerPercentage || 0);
    const amount = roundMoney((bookingValue * pct) / 100);

    const [existing] = await tx
      .select({ id: commissions.id, status: commissions.status })
      .from(commissions)
      .where(
        and(
          eq(commissions.tenantId, tenantId),
          eq(commissions.bookingId, bookingId),
          eq(commissions.channelPartnerId, attribution.channelPartnerId)
        )
      )
      .limit(1);

    const now = new Date();

    if (existing) {
      // Approved and paid rows are never rewritten — money already committed
      // is a finance decision, not something a booking edit should change.
      if (existing.status !== 'pending') return;
      await tx
        .update(commissions)
        .set({
          percentageRate: pct.toString(),
          baseAmount: bookingValue.toFixed(2),
          totalAmount: amount.toFixed(2),
          updatedAt: now
        })
        .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, existing.id)));
      return;
    }

    await tx.insert(commissions).values({
      id: randomUUID(),
      tenantId,
      bookingId,
      dealId: booking.dealId,
      leadId: booking.leadId,
      agentUserId: null,
      channelPartnerId: attribution.channelPartnerId,
      type: 'channel_partner',
      percentageRate: pct.toString(),
      fixedAmount: null,
      baseAmount: bookingValue.toFixed(2),
      totalAmount: amount.toFixed(2),
      status: 'pending',
      notes: `Auto-accrued on booking ${booking.bookingNumber}.`,
      createdByUserId: actorUserId ?? null,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * Withdraws an accrual nobody has acted on when a booking is cancelled.
   * Approved and paid rows survive.
   */
  async reverseForBooking(tx: DrizzleTransaction, tenantId: string, bookingId: string) {
    await tx
      .delete(commissions)
      .where(
        and(
          eq(commissions.tenantId, tenantId),
          eq(commissions.bookingId, bookingId),
          eq(commissions.status, 'pending')
        )
      );
  }
}
