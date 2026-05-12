import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { whatsappAccounts } from './whatsapp.schema';

export const templateCategoryEnum = pgEnum('whatsapp_template_category', [
  'marketing',
  'utility',
  'authentication',
]);

export const templateStatusEnum = pgEnum('whatsapp_template_status', [
  'pending',
  'approved',
  'rejected',
  'disabled',
]);

export const whatsappTemplates = pgTable(
  'whatsapp_templates',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    whatsappAccountId: varchar('whatsapp_account_id', { length: 36 }).references(
      () => whatsappAccounts.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 100 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    category: templateCategoryEnum('category').notNull(),
    language: varchar('language', { length: 10 }).default('en').notNull(),
    status: templateStatusEnum('status').default('pending').notNull(),
    headerText: varchar('header_text', { length: 500 }),
    bodyText: text('body_text').notNull(),
    footerText: varchar('footer_text', { length: 300 }),
    variables: jsonb('variables').$type<string[]>(),
    metaTemplateId: varchar('meta_template_id', { length: 100 }),
    rejectionReason: text('rejection_reason'),
    isActive: boolean('is_active').default(true).notNull(),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tenantIdx: index('whatsapp_templates_tenant_idx').on(table.tenantId),
    statusIdx: index('whatsapp_templates_status_idx').on(table.status),
    accountIdx: index('whatsapp_templates_account_idx').on(
      table.whatsappAccountId,
    ),
  }),
);
