import { boolean, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants.schema';
import { users } from './users.schema';

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    type: varchar('type', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message'),

    isRead: boolean('is_read').notNull().default(false),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow()
});
