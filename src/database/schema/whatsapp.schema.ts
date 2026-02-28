import {
    pgTable,
    varchar,
    timestamp,
    uniqueIndex,
    boolean,
    index,
    jsonb,
    text,
    pgEnum
} from 'drizzle-orm/pg-core';

export const whatsappMessageDirectionEnum = pgEnum('whatsapp_message_direction', ['inbound', 'outbound']);
export const whatsappMessageStatusEnum = pgEnum('whatsapp_message_status', ['sent', 'delivered', 'read', 'failed', 'received']);

export const whatsappAccounts = pgTable(
    'whatsapp_accounts',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        businessAccountId: varchar('business_account_id', { length: 100 }).notNull(),
        phoneNumberId: varchar('phone_number_id', { length: 100 }).notNull(),
        phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
        wabaId: varchar('waba_id', { length: 100 }),
        encryptedPermanentToken: text('encrypted_permanent_token').notNull(),
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        tenantIdx: index('whatsapp_accounts_tenant_idx').on(table.tenantId),
        phoneIdIdx: index('whatsapp_accounts_phone_id_idx').on(table.phoneNumberId),
        tenantUnique: uniqueIndex('whatsapp_accounts_tenant_uq').on(table.tenantId)
    })
);

export const whatsappMessages = pgTable(
    'whatsapp_messages',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        leadId: varchar('lead_id', { length: 36 }), // Nullable if lead not identified yet
        contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
        direction: whatsappMessageDirectionEnum('direction').notNull(),
        messageId: varchar('message_id', { length: 100 }).notNull(), // Meta's ID
        status: whatsappMessageStatusEnum('status').notNull(),
        content: jsonb('content').notNull(),
        isTemplate: boolean('is_template').default(false).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        tenantIdx: index('whatsapp_messages_tenant_idx').on(table.tenantId),
        leadIdx: index('whatsapp_messages_lead_idx').on(table.leadId),
        messageIdUnique: uniqueIndex('whatsapp_messages_message_id_uq').on(table.messageId)
    })
);

export const whatsappSessions = pgTable(
    'whatsapp_sessions',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
        lastCustomerMessageAt: timestamp('last_customer_message_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        tenantContactUnique: uniqueIndex('whatsapp_sessions_tenant_contact_uq').on(table.tenantId, table.contactPhone)
    })
);

export const whatsappMessageQueue = pgTable(
    'whatsapp_message_queue',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        leadId: varchar('lead_id', { length: 36 }),
        contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
        payload: jsonb('payload').notNull(),
        attempts: varchar('attempts', { length: 10 }).default('0').notNull(), // Smallint could be better, but varchar works for simplicity given project standards
        isProcessing: boolean('is_processing').default(false).notNull(),
        lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
        errorLog: text('error_log'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        queuePollingIdx: index('whatsapp_message_queue_polling_idx').on(table.nextAttemptAt, table.isProcessing)
    })
);
