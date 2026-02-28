import {
    pgTable,
    varchar,
    timestamp,
    boolean,
    index,
    jsonb,
    text,
    pgEnum,
    uniqueIndex
} from 'drizzle-orm/pg-core';

export const calendarProviderEnum = pgEnum('calendar_provider', ['google', 'microsoft']);
export const calendarSyncActionEnum = pgEnum('calendar_sync_action', ['create', 'update', 'delete']);

export const userCalendarConnections = pgTable(
    'user_calendar_connections',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        userId: varchar('user_id', { length: 36 }).notNull(),
        provider: calendarProviderEnum('provider').notNull(),
        accountId: varchar('account_id', { length: 255 }).notNull(), // Email connected
        encryptedAccessToken: text('encrypted_access_token').notNull(),
        encryptedRefreshToken: text('encrypted_refresh_token'),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        syncToken: varchar('sync_token', { length: 255 }), // Google Sync Token / MS Delta Token
        isActive: boolean('is_active').default(true).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        tenantUserIdx: index('user_calendar_connections_tenant_user_idx').on(table.tenantId, table.userId),
        providerAccountUnique: uniqueIndex('user_calendar_connections_provider_account_uq').on(
            table.tenantId,
            table.userId,
            table.provider
        )
    })
);

export const calendarSyncQueue = pgTable(
    'calendar_sync_queue',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        userId: varchar('user_id', { length: 36 }).notNull(),
        taskId: varchar('task_id', { length: 36 }).notNull(),
        provider: calendarProviderEnum('provider').notNull(),
        action: calendarSyncActionEnum('action').notNull(),
        payload: jsonb('payload').notNull(), // task snapshot
        attempts: varchar('attempts', { length: 10 }).default('0').notNull(),
        isProcessing: boolean('is_processing').default(false).notNull(),
        lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
        errorLog: text('error_log'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (table) => ({
        queuePollingIdx: index('calendar_sync_queue_polling_idx').on(table.nextAttemptAt, table.isProcessing)
    })
);
