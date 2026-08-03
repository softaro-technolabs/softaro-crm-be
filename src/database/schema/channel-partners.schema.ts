import { index, numeric, pgEnum, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/**
 * Channel Partner (CP) module.
 * - channel_partners: broker/CP firms working a tenant's inventory.
 * - channel_partner_users: portal login accounts scoped to one CP.
 * - cp_lead_attributions: first CP to register a lead owns it (unique per tenant+lead).
 * - cp_incentives: accrued commission when an attributed lead's deal closes.
 */

export const channelPartnerStatusEnum = pgEnum('channel_partner_status', ['pending', 'active', 'suspended']);
export const cpUserRoleEnum = pgEnum('cp_user_role', ['cp_admin', 'cp_agent']);
export const cpIncentiveStatusEnum = pgEnum('cp_incentive_status', ['accrued', 'approved', 'paid']);

export const channelPartners = pgTable(
  'channel_partners',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    firmName: varchar('firm_name', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    reraRegNo: varchar('rera_reg_no', { length: 100 }),
    status: channelPartnerStatusEnum('status').default('pending').notNull(),
    commissionPercentage: numeric('commission_percentage', { precision: 5, scale: 2 }).default('2').notNull(),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('channel_partners_tenant_idx').on(table.tenantId),
    tenantStatusIdx: index('channel_partners_tenant_status_idx').on(table.tenantId, table.status),
    tenantEmailIdx: index('channel_partners_tenant_email_idx').on(table.tenantId, table.email)
  })
);

export const channelPartnerUsers = pgTable(
  'channel_partner_users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    channelPartnerId: varchar('channel_partner_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: cpUserRoleEnum('role').default('cp_agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('channel_partner_users_tenant_idx').on(table.tenantId),
    cpIdx: index('channel_partner_users_cp_idx').on(table.channelPartnerId),
    tenantEmailUnique: uniqueIndex('channel_partner_users_tenant_email_uq').on(table.tenantId, table.email)
  })
);

export const cpLeadAttributions = pgTable(
  'cp_lead_attributions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    channelPartnerId: varchar('channel_partner_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    attributedAt: timestamp('attributed_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('cp_lead_attributions_tenant_idx').on(table.tenantId),
    cpIdx: index('cp_lead_attributions_cp_idx').on(table.channelPartnerId),
    // One attribution per lead per tenant — first CP wins.
    tenantLeadUnique: uniqueIndex('cp_lead_attributions_tenant_lead_uq').on(table.tenantId, table.leadId)
  })
);

export const cpIncentives = pgTable(
  'cp_incentives',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    channelPartnerId: varchar('channel_partner_id', { length: 36 }).notNull(),
    dealId: varchar('deal_id', { length: 36 }).notNull(),
    bookingAmount: numeric('booking_amount', { precision: 15, scale: 2 }).notNull(),
    incentivePercentage: numeric('incentive_percentage', { precision: 5, scale: 2 }).notNull(),
    incentiveAmount: numeric('incentive_amount', { precision: 15, scale: 2 }).notNull(),
    status: cpIncentiveStatusEnum('status').default('accrued').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('cp_incentives_tenant_idx').on(table.tenantId),
    cpIdx: index('cp_incentives_cp_idx').on(table.channelPartnerId),
    tenantStatusIdx: index('cp_incentives_tenant_status_idx').on(table.tenantId, table.status),
    dealIdx: index('cp_incentives_deal_idx').on(table.dealId)
  })
);
