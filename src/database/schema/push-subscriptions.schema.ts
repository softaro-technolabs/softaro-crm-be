import { jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

/** ids are varchar(36) to match tenants.id / users.id — see notifications.schema.ts. */
export const pushSubscriptions = pgTable('push_subscriptions', {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 })
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    subscription: jsonb('subscription').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
