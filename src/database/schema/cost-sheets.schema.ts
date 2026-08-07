import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

import { bookings } from './bookings.schema';
import { propertyEntities } from './properties.schema';

/**
 * The standard heads on an Indian real-estate cost sheet.
 *
 * `taxTreatment` on each line decides the arithmetic, not the head itself —
 * these exist so a cost sheet can be read, grouped and reported on
 * consistently across tenants.
 */
export const costHeadEnum = pgEnum('cost_head', [
  'base_price',
  'plc', // preferential location charge
  'floor_rise',
  'parking',
  'club_membership',
  'maintenance',
  'infrastructure',
  'legal',
  'stamp_duty',
  'registration',
  'gst',
  'other'
]);

/**
 * How a line participates in the tax calculation.
 *
 * - `agreement_value` — part of the agreement value: attracts GST and stamp duty.
 *   Base price, PLC, floor rise, parking, club.
 * - `gst_only` — attracts GST but not stamp duty (misc/other charges).
 * - `statutory` — a tax or government charge itself; never taxed again.
 *   Stamp duty, registration, GST.
 */
export const taxTreatmentEnum = pgEnum('tax_treatment', [
  'agreement_value',
  'gst_only',
  'statutory'
]);

/**
 * One line of a booking's cost sheet.
 *
 * Before this existed a booking carried a single `bookingAmount`, so an
 * allotment letter could not show a customer what they were paying for and no
 * two tenants agreed on what the number included.
 *
 * Lines are snapshotted onto the booking at creation. They deliberately do NOT
 * follow later changes to the unit's price list: the cost sheet is what the
 * customer agreed to on the day.
 */
export const bookingCostSheetItems = pgTable(
  'booking_cost_sheet_items',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    bookingId: varchar('booking_id', { length: 36 })
      .references(() => bookings.id, { onDelete: 'cascade' })
      .notNull(),
    head: costHeadEnum('head').notNull(),
    /** Customer-facing label, e.g. "Covered car parking (2 nos.)". */
    label: varchar('label', { length: 160 }).notNull(),
    taxTreatment: taxTreatmentEnum('tax_treatment').notNull(),
    /** Gross amount for this line, BEFORE any discount. */
    amount: numeric('amount', { precision: 15, scale: 2 }).default('0').notNull(),
    /** Absolute discount on this line. Applied before tax is computed. */
    discount: numeric('discount', { precision: 15, scale: 2 }).default('0').notNull(),
    /** Rate used when the line is computed per unit area rather than as a lump sum. */
    ratePerUnit: numeric('rate_per_unit', { precision: 15, scale: 2 }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    /** Percentage, for statutory lines expressed as a rate (GST, stamp duty). */
    percentage: numeric('percentage', { precision: 5, scale: 2 }),
    sortOrder: integer('sort_order').default(0).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('booking_cost_sheet_items_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_cost_sheet_items_booking_idx').on(table.bookingId)
  })
);

/**
 * Audit trail for discounts.
 *
 * A discount is the single most disputed number on a cost sheet — "who agreed
 * to this?" needs an answer that is not somebody's memory. Recorded whether or
 * not an approval workflow is switched on.
 */
export const bookingDiscountLogs = pgTable(
  'booking_discount_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    bookingId: varchar('booking_id', { length: 36 })
      .references(() => bookings.id, { onDelete: 'cascade' })
      .notNull(),
    previousDiscount: numeric('previous_discount', { precision: 15, scale: 2 }).default('0').notNull(),
    newDiscount: numeric('new_discount', { precision: 15, scale: 2 }).default('0').notNull(),
    /** Discount as a percentage of gross agreement value, for threshold reporting. */
    discountPercentage: numeric('discount_percentage', { precision: 6, scale: 3 }),
    reason: text('reason'),
    changedByUserId: varchar('changed_by_user_id', { length: 36 }),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('booking_discount_logs_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_discount_logs_booking_idx').on(table.bookingId)
  })
);

/**
 * A reusable payment schedule — "construction linked", "down payment",
 * "possession linked".
 *
 * Scoped to a project (`entityId`) because plans differ between towers, with
 * `entityId = null` meaning a tenant-wide default.
 */
export const paymentPlanTemplates = pgTable(
  'payment_plan_templates',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).references(() => propertyEntities.id, {
      onDelete: 'cascade'
    }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('payment_plan_templates_tenant_idx').on(table.tenantId),
    entityIdx: index('payment_plan_templates_entity_idx').on(table.entityId),
    tenantEntityNameUnique: uniqueIndex('payment_plan_templates_tenant_entity_name_uq').on(
      table.tenantId,
      table.entityId,
      table.name
    )
  })
);

/**
 * One instalment of a payment plan template.
 *
 * Either a percentage of the cost sheet total or a fixed amount. Percentages
 * are the norm; `dueOffsetDays` covers time-linked plans where there is no
 * construction milestone to hang the instalment on.
 */
export const paymentPlanTemplateItems = pgTable(
  'payment_plan_template_items',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    templateId: varchar('template_id', { length: 36 })
      .references(() => paymentPlanTemplates.id, { onDelete: 'cascade' })
      .notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    percentage: numeric('percentage', { precision: 6, scale: 3 }),
    fixedAmount: numeric('fixed_amount', { precision: 15, scale: 2 }),
    /** Days after the booking date this instalment falls due, when time-linked. */
    dueOffsetDays: integer('due_offset_days'),
    sortOrder: integer('sort_order').default(0).notNull()
  },
  (table) => ({
    tenantIdx: index('payment_plan_template_items_tenant_idx').on(table.tenantId),
    templateIdx: index('payment_plan_template_items_template_idx').on(table.templateId)
  })
);
