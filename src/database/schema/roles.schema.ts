import {
  pgTable,
  varchar,
  boolean,
  index,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const roles = pgTable(
  'roles',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('roles_tenant_idx').on(table.tenantId),
    tenantNameUnique: uniqueIndex('roles_tenant_name_uq').on(table.tenantId, table.name)
  })
);





