import {
    pgTable,
    varchar,
    timestamp,
    boolean,
    index,
    text,
    jsonb,
    uniqueIndex
} from 'drizzle-orm/pg-core';

export const metaAdsAccounts = pgTable(
    'meta_ads_accounts',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        pageId: varchar('page_id', { length: 100 }).notNull(),
        pageName: varchar('page_name', { length: 255 }).notNull(),
        encryptedPageAccessToken: text('encrypted_page_access_token').notNull(),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        tenantIdx: index('meta_ads_accounts_tenant_idx').on(table.tenantId),
        pageIdIdx: index('meta_ads_accounts_page_id_idx').on(table.pageId)
    })
);

export const metaAdsLeads = pgTable(
    'meta_ads_leads',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        leadgenId: varchar('leadgen_id', { length: 100 }).notNull(),
        pageId: varchar('page_id', { length: 100 }).notNull(),
        formId: varchar('form_id', { length: 100 }).notNull(),
        formData: jsonb('form_data').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        leadgenIdUnique: uniqueIndex('meta_ads_leads_leadgen_id_uq').on(table.leadgenId)
    })
);
