import {
  pgEnum,
  pgTable,
  timestamp,
  varchar,
  numeric,
  index,
  jsonb,
  text
} from 'drizzle-orm/pg-core';
import { leads } from './leads.schema';
import { quotations } from './quotations.schema';
import { contacts } from './contacts.schema';
import { propertyUnits } from './properties.schema';

export const dealStatusEnum = pgEnum('deal_status', [
  'active',
  'closed_won',
  'closed_lost',
  'cancelled',
  'pending_payment',
  'on_hold'
]);

export const deals = pgTable(
  'deals',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'set null' }),
    contactId: varchar('contact_id', { length: 36 }).references(() => contacts.id, { onDelete: 'set null' }),
    quotationId: varchar('quotation_id', { length: 36 }).references(() => quotations.id, { onDelete: 'set null' }),
    propertyUnitId: varchar('property_unit_id', { length: 36 }).references(() => propertyUnits.id, { onDelete: 'set null' }),
    dealNumber: varchar('deal_number', { length: 50 }).notNull(),
    status: dealStatusEnum('status').default('active').notNull(),
    expectedClosingDate: timestamp('expected_closing_date', { withTimezone: true }),
    actualClosingDate: timestamp('actual_closing_date', { withTimezone: true }),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    receivedAmount: numeric('received_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    pendingAmount: numeric('pending_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('deals_tenant_idx').on(table.tenantId),
    leadIdx: index('deals_lead_idx').on(table.leadId),
    contactIdx: index('deals_contact_idx').on(table.contactId),
    quotationIdx: index('deals_quotation_idx').on(table.quotationId),
    statusIdx: index('deals_status_idx').on(table.status)
  })
);
