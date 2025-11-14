import {
  mysqlTable,
  varchar,
  boolean,
  index,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/mysql-core';

export const roles = mysqlTable(
  'roles',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('roles_tenant_idx').on(table.tenantId),
    tenantNameUnique: uniqueIndex('roles_tenant_name_uq').on(table.tenantId, table.name)
  })
);



