import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase, DrizzleTransaction } from '../database/database.types';
import {
  bookings,
  channelPartners,
  commissions,
  cpIncentives,
  cpLeadAttributions,
  deals,
  leads
} from '../database/schema';
import { roundMoney } from '../common/utils/cost-sheet.util';

/**
 * Turns a confirmed booking into money owed to the people who sold it.
 *
 * Previously a channel-partner incentive was only ever created as a side
 * effect of converting a quotation, and internal agent commissions were never
 * created at all — the `commissions` table only ever filled up if somebody
 * added rows by hand. Both now follow the booking, which is the event that
 * actually earns them.
 */
@Injectable()
export class BookingCommissionsService {
  private readonly logger = new Logger(BookingCommissionsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  /**
   * Accrues the channel-partner incentive and the selling agent's commission
   * for a booking.
   *
   * Idempotent by design: it is called on every confirm, and a booking that
   * flips confirmed → cancelled → confirmed must not pay anyone twice.
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

    if (!booking || !booking.dealId || !booking.leadId) return;

    const bookingValue = roundMoney(Number(booking.bookingAmount ?? 0));
    if (bookingValue <= 0) return;

    await this.accrueChannelPartnerIncentive(tx, tenantId, booking.leadId, booking.dealId, bookingValue);
    await this.accrueAgentCommission(tx, tenantId, booking, bookingValue, actorUserId);
  }

  private async accrueChannelPartnerIncentive(
    tx: DrizzleTransaction,
    tenantId: string,
    leadId: string,
    dealId: string,
    bookingValue: number
  ) {
    const [attribution] = await tx
      .select({ channelPartnerId: cpLeadAttributions.channelPartnerId })
      .from(cpLeadAttributions)
      .where(and(eq(cpLeadAttributions.tenantId, tenantId), eq(cpLeadAttributions.leadId, leadId)))
      .limit(1);

    if (!attribution) return;

    // One incentive per deal. Re-confirming must not duplicate it.
    const [existing] = await tx
      .select({ id: cpIncentives.id })
      .from(cpIncentives)
      .where(and(eq(cpIncentives.tenantId, tenantId), eq(cpIncentives.dealId, dealId)))
      .limit(1);

    const [partner] = await tx
      .select({ commissionPercentage: channelPartners.commissionPercentage })
      .from(channelPartners)
      .where(
        and(eq(channelPartners.tenantId, tenantId), eq(channelPartners.id, attribution.channelPartnerId))
      )
      .limit(1);

    if (!partner) return;

    const pct = Number(partner.commissionPercentage || 0);
    const incentiveAmount = roundMoney((bookingValue * pct) / 100);
    const now = new Date();

    if (existing) {
      // Refresh the value — the booking amount may have changed since the
      // quotation created it — but never touch an incentive already paid out.
      await tx
        .update(cpIncentives)
        .set({
          bookingAmount: bookingValue.toFixed(2),
          incentivePercentage: pct.toString(),
          incentiveAmount: incentiveAmount.toFixed(2),
          updatedAt: now
        })
        .where(
          and(
            eq(cpIncentives.tenantId, tenantId),
            eq(cpIncentives.id, existing.id),
            eq(cpIncentives.status, 'accrued')
          )
        );
      return;
    }

    await tx.insert(cpIncentives).values({
      id: randomUUID(),
      tenantId,
      channelPartnerId: attribution.channelPartnerId,
      dealId,
      bookingAmount: bookingValue.toFixed(2),
      incentivePercentage: pct.toString(),
      incentiveAmount: incentiveAmount.toFixed(2),
      status: 'accrued',
      createdAt: now,
      updatedAt: now
    });
  }

  private async accrueAgentCommission(
    tx: DrizzleTransaction,
    tenantId: string,
    booking: typeof bookings.$inferSelect,
    bookingValue: number,
    actorUserId?: string | null
  ) {
    const [deal] = await tx
      .select({ assignedToUserId: deals.assignedToUserId })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, booking.dealId!)))
      .limit(1);

    // Fall back to whoever owns the lead when the deal has no owner.
    let agentUserId = deal?.assignedToUserId ?? null;
    if (!agentUserId && booking.leadId) {
      const [lead] = await tx
        .select({ assignedToUserId: leads.assignedToUserId })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, booking.leadId)))
        .limit(1);
      agentUserId = lead?.assignedToUserId ?? null;
    }

    if (!agentUserId) return;

    const [existing] = await tx
      .select({ id: commissions.id, status: commissions.status })
      .from(commissions)
      .where(
        and(
          eq(commissions.tenantId, tenantId),
          eq(commissions.dealId, booking.dealId!),
          eq(commissions.agentUserId, agentUserId),
          eq(commissions.type, 'brokerage')
        )
      )
      .limit(1);

    const now = new Date();

    if (existing) {
      // Leave approved/paid rows alone — money already committed.
      if (existing.status !== 'pending') return;
      await tx
        .update(commissions)
        .set({ totalAmount: bookingValue.toFixed(2), updatedAt: now })
        .where(and(eq(commissions.tenantId, tenantId), eq(commissions.id, existing.id)));
      return;
    }

    // The rate is a business decision per tenant; recorded at zero so the row
    // exists to be approved and priced rather than silently inventing a rate.
    await tx.insert(commissions).values({
      id: randomUUID(),
      tenantId,
      dealId: booking.dealId,
      leadId: booking.leadId,
      agentUserId,
      type: 'brokerage',
      percentageRate: null,
      fixedAmount: null,
      totalAmount: '0',
      status: 'pending',
      notes: `Auto-accrued on booking ${booking.bookingNumber} (booking value ₹${bookingValue.toFixed(2)}).`,
      createdByUserId: actorUserId ?? null,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * Reverses accruals when a booking is cancelled.
   *
   * Only untouched rows are removed: anything already approved or paid stays,
   * because reversing real money is a finance decision, not a side effect of
   * someone clicking cancel.
   */
  async reverseForBooking(tx: DrizzleTransaction, tenantId: string, dealId: string | null) {
    if (!dealId) return;

    await tx
      .delete(cpIncentives)
      .where(
        and(
          eq(cpIncentives.tenantId, tenantId),
          eq(cpIncentives.dealId, dealId),
          eq(cpIncentives.status, 'accrued')
        )
      );

    await tx
      .delete(commissions)
      .where(
        and(
          eq(commissions.tenantId, tenantId),
          eq(commissions.dealId, dealId),
          eq(commissions.status, 'pending')
        )
      );
  }
}
