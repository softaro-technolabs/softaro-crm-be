import { boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants.schema';
import { users } from './users.schema';

/**
 * NOTE: ids are varchar(36), not uuid.
 *
 * `tenants.id` and `users.id` are varchar(36) throughout this codebase, and a
 * uuid column cannot carry a foreign key to a varchar one — the declaration
 * that used to be here was impossible for Postgres to satisfy. It also made
 * `drizzle-kit push` propose truncating this table on every boot to "correct"
 * the column type, which aborted the whole push and silently blocked every
 * other pending schema change.
 */
export const notifications = pgTable('notifications', {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 })
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    type: varchar('type', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message'),

    isRead: boolean('is_read').notNull().default(false),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
});
