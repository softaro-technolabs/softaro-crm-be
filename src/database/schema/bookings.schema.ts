import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar
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
