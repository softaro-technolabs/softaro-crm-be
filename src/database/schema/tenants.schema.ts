import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  mysqlEnum
} from 'drizzle-orm/mysql-core';

export const tenants = mysqlTable(
  'tenants',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    plan: varchar('plan', { length: 100 }),
    status: mysqlEnum('status', ['active', 'suspended', 'cancelled']).default('active').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .onUpdateNow()
      .notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex('tenants_slug_uq').on(table.slug)
  })
);

