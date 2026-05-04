import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  integer
} from 'drizzle-orm/pg-core';

import { deals } from './deals.schema';
import { leads } from './leads.schema';
import { propertyUnits } from './properties.schema';

export const bookingStatusEnum = pgEnum('booking_status', [
  'draft',
  'confirmed',
  'cancelled',
  'completed'
]);

export const bookings = pgTable(
  'bookings',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    dealId: varchar('deal_id', { length: 36 }).references(() => deals.id, { onDelete: 'set null' }),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'set null' }),
    propertyUnitId: varchar('property_unit_id', { length: 36 }).references(() => propertyUnits.id, { onDelete: 'set null' }),
    quotationId: varchar('quotation_id', { length: 36 }),
    bookingNumber: varchar('booking_number', { length: 50 }).notNull(),
    bookingDate: timestamp('booking_date', { withTimezone: true }).notNull(),
    bookingAmount: numeric('booking_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    paidAmount: numeric('paid_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    status: bookingStatusEnum('status').default('draft').notNull(),
    notes: text('notes'),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('bookings_tenant_idx').on(table.tenantId),
    dealIdx: index('bookings_deal_idx').on(table.dealId),
    leadIdx: index('bookings_lead_idx').on(table.leadId),
    unitIdx: index('bookings_property_unit_idx').on(table.propertyUnitId),
    statusIdx: index('bookings_status_idx').on(table.status)
  })
);

export const bookingMilestones = pgTable(
  'booking_milestones',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    bookingId: varchar('booking_id', { length: 36 }).references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, paid, partial
    sortOrder: integer('sort_order').default(0).notNull()
  },
  (table) => ({
    tenantIdx: index('booking_milestones_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_milestones_booking_idx').on(table.bookingId)
  })
);

export const bookingPayments = pgTable(
  'booking_payments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    bookingId: varchar('booking_id', { length: 36 }).references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
    milestoneId: varchar('milestone_id', { length: 36 }).references(() => bookingMilestones.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // cash, check, transfer, online
    transactionReference: varchar('transaction_reference', { length: 120 }),
    status: varchar('status', { length: 20 }).default('cleared').notNull(), // cleared, bounced, pending
    receiptNumber: varchar('receipt_number', { length: 50 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('booking_payments_tenant_idx').on(table.tenantId),
    bookingIdx: index('booking_payments_booking_idx').on(table.bookingId)
  })
);
