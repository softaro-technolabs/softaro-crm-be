import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase, DrizzleExecutor, DrizzleTransaction } from '../database/database.types';
import {
  bookingCostSheetItems,
  bookingDiscountLogs,
  bookingMilestones,
  paymentPlanTemplateItems,
  paymentPlanTemplates,
  propertyPricingBreakups,
  propertyUnits
} from '../database/schema';
import { computeCostSheet, roundMoney } from '../common/utils/cost-sheet.util';

/** A cost-sheet line with its own arithmetic already resolved. */
export interface CostSheetLine {
  head: typeof bookingCostSheetItems.$inferSelect['head'];
  label: string;
  taxTreatment: typeof bookingCostSheetItems.$inferSelect['taxTreatment'];
  amount: number;
  discount: number;
  /** amount − discount */
  net: number;
  percentage?: number | null;
}

export interface CostSheetSummary {
  lines: CostSheetLine[];
  basePrice: number;
  additionalCharges: number;
  otherCharges: number;
  discount: number;
  agreementValue: number;
  taxableValue: number;
  gstAmount: number;
  stampDutyAmount: number;
  registrationCharges: number;
  totalCharges: number;
  /** The number the customer pays. Drives the booking amount and milestones. */
  grandTotal: number;
}

/**
 * Builds and reads the per-booking cost sheet.
 *
 * All arithmetic routes through `computeCostSheet` so a unit can never produce
 * one total on a quotation and a different total on the booking — the whole
 * reason that util exists.
 */
@Injectable()
export class CostSheetService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  /**
   * Derives a starting cost sheet from a unit's price list.
   *
   * Used when a booking is created without explicit lines, so the common case
   * — "book this flat at list price" — needs no data entry at all.
   */
  async buildDefaultLinesForUnit(
    executor: DrizzleExecutor,
    tenantId: string,
    propertyUnitId: string,
    overrideBasePrice?: number
  ): Promise<Array<typeof bookingCostSheetItems.$inferInsert>> {
    const runner = executor as DrizzleDatabase;

    const [unit] = await runner
      .select()
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, propertyUnitId)))
      .limit(1);

    if (!unit) throw new NotFoundException('Property unit not found');

    const breakups = await runner
      .select()
      .from(propertyPricingBreakups)
      .where(
        and(
          eq(propertyPricingBreakups.tenantId, tenantId),
          eq(propertyPricingBreakups.unitId, propertyUnitId)
        )
      );

    const lines: Array<Omit<typeof bookingCostSheetItems.$inferInsert, 'id' | 'tenantId' | 'bookingId'>> = [];
    let sortOrder = 0;

    lines.push({
      head: 'base_price',
      label: 'Base price',
      taxTreatment: 'agreement_value',
      amount: roundMoney(overrideBasePrice ?? Number(unit.price ?? 0)).toFixed(2),
      discount: '0',
      sortOrder: sortOrder++
    });

    // The unit's configured pricing breakups (PLC, floor rise, parking, club…)
    // carry across as their own lines so the customer sees the itemisation.
    for (const breakup of breakups) {
      lines.push({
        head: this.mapBreakupToHead(breakup.label),
        label: breakup.label,
        taxTreatment: 'agreement_value',
        amount: roundMoney(Number(breakup.amount ?? 0)).toFixed(2),
        discount: '0',
        sortOrder: sortOrder++
      });
    }

    return lines as Array<typeof bookingCostSheetItems.$inferInsert>;
  }

  /** Best-effort mapping of a free-text breakup label onto a standard head. */
  private mapBreakupToHead(label: string): typeof bookingCostSheetItems.$inferSelect['head'] {
    const l = (label || '').toLowerCase();
    if (l.includes('plc') || l.includes('preferential')) return 'plc';
    if (l.includes('floor')) return 'floor_rise';
    if (l.includes('park')) return 'parking';
    if (l.includes('club')) return 'club_membership';
    if (l.includes('maint')) return 'maintenance';
    if (l.includes('infra')) return 'infrastructure';
    if (l.includes('legal')) return 'legal';
    return 'other';
  }

  /** Replaces a booking's cost-sheet lines wholesale. */
  async replaceLines(
    tx: DrizzleTransaction,
    tenantId: string,
    bookingId: string,
    lines: Array<Partial<typeof bookingCostSheetItems.$inferInsert>>
  ) {
    await tx
      .delete(bookingCostSheetItems)
      .where(
        and(
          eq(bookingCostSheetItems.tenantId, tenantId),
          eq(bookingCostSheetItems.bookingId, bookingId)
        )
      );

    if (!lines.length) return;

    await tx.insert(bookingCostSheetItems).values(
      lines.map((line, idx) => ({
        ...line,
        id: randomUUID(),
        tenantId,
        bookingId,
        sortOrder: line.sortOrder ?? idx
      })) as Array<typeof bookingCostSheetItems.$inferInsert>
    );
  }

  /**
   * Reads a booking's cost sheet and computes every derived total.
   *
   * Statutory lines (GST, stamp duty, registration) are treated as *rates* when
   * a percentage is stored, so changing the base price re-derives the tax
   * instead of leaving a stale figure behind.
   */
  async getCostSheet(
    executor: DrizzleExecutor,
    tenantId: string,
    bookingId: string
  ): Promise<CostSheetSummary> {
    const runner = executor as DrizzleDatabase;

    const rows = await runner
      .select()
      .from(bookingCostSheetItems)
      .where(
        and(
          eq(bookingCostSheetItems.tenantId, tenantId),
          eq(bookingCostSheetItems.bookingId, bookingId)
        )
      )
      .orderBy(asc(bookingCostSheetItems.sortOrder));

    const lines: CostSheetLine[] = rows.map((row) => {
      const amount = roundMoney(Number(row.amount ?? 0));
      const discount = roundMoney(Number(row.discount ?? 0));
      return {
        head: row.head,
        label: row.label,
        taxTreatment: row.taxTreatment,
        amount,
        discount,
        net: roundMoney(Math.max(amount - discount, 0)),
        percentage: row.percentage != null ? Number(row.percentage) : null
      };
    });

    const sumWhere = (predicate: (l: CostSheetLine) => boolean) =>
      roundMoney(lines.filter(predicate).reduce((total, l) => total + l.amount, 0));

    const basePrice = sumWhere((l) => l.head === 'base_price');
    const additionalCharges = sumWhere(
      (l) => l.taxTreatment === 'agreement_value' && l.head !== 'base_price'
    );
    const otherCharges = sumWhere((l) => l.taxTreatment === 'gst_only');
    const discount = roundMoney(lines.reduce((total, l) => total + l.discount, 0));

    // Statutory lines: a stored percentage wins over a stored amount, so the
    // tax follows the price rather than going stale.
    const gstLine = lines.find((l) => l.head === 'gst');
    const stampLine = lines.find((l) => l.head === 'stamp_duty');
    const registrationLine = lines.find((l) => l.head === 'registration');

    const computed = computeCostSheet({
      basePrice,
      additionalCharges,
      otherCharges,
      discount,
      gstPercentage: gstLine?.percentage ?? 0,
      stampDutyPercentage: stampLine?.percentage ?? undefined,
      stampDutyAmount: stampLine?.percentage == null ? stampLine?.net ?? 0 : undefined,
      registrationCharges: registrationLine?.net ?? 0
    });

    return { lines, ...computed };
  }

  /**
   * Records a discount change with who made it and why.
   *
   * There is no approval gate: the log is the control. Reporting on
   * `discountPercentage` is what surfaces an agent giving away margin.
   */
  async logDiscountChange(
    tx: DrizzleTransaction,
    tenantId: string,
    bookingId: string,
    input: {
      previousDiscount: number;
      newDiscount: number;
      grossAgreementValue: number;
      reason?: string | null;
      changedByUserId?: string | null;
    }
  ) {
    if (roundMoney(input.previousDiscount) === roundMoney(input.newDiscount)) return;

    await tx.insert(bookingDiscountLogs).values({
      id: randomUUID(),
      tenantId,
      bookingId,
      previousDiscount: roundMoney(input.previousDiscount).toFixed(2),
      newDiscount: roundMoney(input.newDiscount).toFixed(2),
      discountPercentage:
        input.grossAgreementValue > 0
          ? ((input.newDiscount / input.grossAgreementValue) * 100).toFixed(3)
          : null,
      reason: input.reason ?? null,
      changedByUserId: input.changedByUserId ?? null,
      changedAt: new Date()
    });
  }

  /**
   * Expands a payment-plan template into concrete milestones for a booking.
   *
   * Rounding is absorbed by the LAST instalment so the schedule always sums to
   * the cost-sheet total exactly — a schedule that is ₹0.03 short of the
   * agreement value is a support ticket every single time.
   */
  async applyPaymentPlan(
    tx: DrizzleTransaction,
    tenantId: string,
    bookingId: string,
    templateId: string,
    total: number,
    bookingDate: Date
  ) {
    const [template] = await tx
      .select()
      .from(paymentPlanTemplates)
      .where(and(eq(paymentPlanTemplates.tenantId, tenantId), eq(paymentPlanTemplates.id, templateId)))
      .limit(1);

    if (!template) throw new NotFoundException('Payment plan template not found');

    const items = await tx
      .select()
      .from(paymentPlanTemplateItems)
      .where(
        and(
          eq(paymentPlanTemplateItems.tenantId, tenantId),
          eq(paymentPlanTemplateItems.templateId, templateId)
        )
      )
      .orderBy(asc(paymentPlanTemplateItems.sortOrder));

    if (!items.length) {
      throw new BadRequestException('Payment plan template has no instalments');
    }

    await tx
      .delete(bookingMilestones)
      .where(
        and(eq(bookingMilestones.tenantId, tenantId), eq(bookingMilestones.bookingId, bookingId))
      );

    let allocated = 0;
    const values = items.map((item, idx) => {
      const isLast = idx === items.length - 1;
      const raw =
        item.fixedAmount != null
          ? Number(item.fixedAmount)
          : (total * Number(item.percentage ?? 0)) / 100;

      const amount = isLast ? roundMoney(total - allocated) : roundMoney(raw);
      allocated = roundMoney(allocated + amount);

      return {
        id: randomUUID(),
        tenantId,
        bookingId,
        label: item.label,
        percentage: item.percentage != null ? String(item.percentage) : null,
        amount: amount.toFixed(2),
        dueDate:
          item.dueOffsetDays != null
            ? new Date(bookingDate.getTime() + item.dueOffsetDays * 86_400_000)
            : null,
        status: 'pending',
        sortOrder: item.sortOrder ?? idx
      };
    });

    await tx.insert(bookingMilestones).values(values as any);
    return values.length;
  }
}
