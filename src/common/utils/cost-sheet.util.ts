/**
 * Single source of truth for real-estate cost-sheet math.
 *
 * Both the Properties cost-sheet endpoint and the Quotations module route through
 * this function so a given unit can never produce two different grand totals.
 *
 * Conventions (Indian real-estate):
 * - Base price is discounted FIRST, then tax is charged on the reduced value.
 * - GST is charged on (agreement value + other charges).
 * - Stamp duty is charged on the agreement value only (not on other/club charges).
 * - Registration is a fixed amount.
 * - All money values are rounded to 2 decimals to avoid fractional-paise drift.
 */

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Round to 2 decimal places (paise), guarding against binary FP drift. */
export const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CostSheetInput {
  /** Gross base price BEFORE discount. */
  basePrice: number;
  /** Charges taxed exactly like the base (PLC, floor rise, parking, club, pricing breakups…). */
  additionalCharges?: number;
  /** Charges that attract GST but NOT stamp duty (misc/other fixed charges). */
  otherCharges?: number;
  /** Absolute discount, applied to (base + additional) BEFORE tax. */
  discount?: number;
  /** GST percentage on the taxable value. */
  gstPercentage: number;
  /** Stamp duty as a percentage of agreement value. Takes precedence over stampDutyAmount. */
  stampDutyPercentage?: number;
  /** Stamp duty as an absolute amount (used only when stampDutyPercentage is not given). */
  stampDutyAmount?: number;
  /** Registration charges (fixed amount). */
  registrationCharges?: number;
}

export interface CostSheetResult {
  basePrice: number;
  additionalCharges: number;
  otherCharges: number;
  discount: number;
  /** (base + additional) − discount, floored at 0. */
  agreementValue: number;
  /** agreementValue + otherCharges (the base GST is charged on). */
  taxableValue: number;
  gstAmount: number;
  stampDutyAmount: number;
  registrationCharges: number;
  /** gst + stampDuty + registration. */
  totalCharges: number;
  grandTotal: number;
}

export function computeCostSheet(input: CostSheetInput): CostSheetResult {
  const base = Math.max(0, num(input.basePrice));
  const additional = Math.max(0, num(input.additionalCharges));
  const other = Math.max(0, num(input.otherCharges));
  const discount = Math.max(0, num(input.discount));

  const agreementValue = Math.max(0, base + additional - discount);
  const taxableValue = agreementValue + other;

  const gstAmount = roundMoney((taxableValue * num(input.gstPercentage)) / 100);

  const stampDutyAmount =
    input.stampDutyPercentage != null
      ? roundMoney((agreementValue * num(input.stampDutyPercentage)) / 100)
      : roundMoney(num(input.stampDutyAmount));

  const registrationCharges = roundMoney(num(input.registrationCharges));

  const totalCharges = roundMoney(gstAmount + stampDutyAmount + registrationCharges);
  const grandTotal = roundMoney(agreementValue + other + gstAmount + stampDutyAmount + registrationCharges);

  return {
    basePrice: roundMoney(base),
    additionalCharges: roundMoney(additional),
    otherCharges: roundMoney(other),
    discount: roundMoney(discount),
    agreementValue: roundMoney(agreementValue),
    taxableValue: roundMoney(taxableValue),
    gstAmount,
    stampDutyAmount,
    registrationCharges,
    totalCharges,
    grandTotal
  };
}
