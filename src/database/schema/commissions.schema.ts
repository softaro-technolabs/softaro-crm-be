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

export const commissionTypeEnum = pgEnum('commission_type', [
  'brokerage',
  'channel_partner',
  'referral',
  'incentive'
]);

export const commissionStatusEnum = pgEnum('commission_status', [
  'pending',
  'approved',
  'paid',
  'cancelled'
]);

export const commissions = pgTable(
  'commissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    dealId: varchar('deal_id', { length: 36 }).references(() => deals.id, { onDelete: 'set null' }),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'set null' }),
    agentUserId: varchar('agent_user_id', { length: 36 }).notNull(),
    type: commissionTypeEnum('type').notNull(),
    percentageRate: numeric('percentage_rate', { precision: 5, scale: 2 }),
    fixedAmount: numeric('fixed_amount', { precision: 15, scale: 2 }),
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    status: commissionStatusEnum('status').default('pending').notNull(),
    notes: text('notes'),
    approvedByUserId: varchar('approved_by_user_id', { length: 36 }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('commissions_tenant_idx').on(table.tenantId),
    dealIdx: index('commissions_deal_idx').on(table.dealId),
    agentIdx: index('commissions_agent_idx').on(table.agentUserId),
    statusIdx: index('commissions_status_idx').on(table.status)
  })
);
