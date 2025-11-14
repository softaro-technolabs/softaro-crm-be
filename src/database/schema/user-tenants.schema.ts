import {
  mysqlTable,
  varchar,
  mysqlEnum,
  json,
  uniqueIndex,
  index,
  timestamp
} from 'drizzle-orm/mysql-core';

export const userTenants = mysqlTable(
  'user_tenants',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    roleId: varchar('role_id', { length: 36 }),
    status: mysqlEnum('status', ['active', 'pending', 'disabled']).default('pending').notNull(),
    meta: json('meta'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => ({
    userIdx: index('user_tenants_user_idx').on(table.userId),
    tenantIdx: index('user_tenants_tenant_idx').on(table.tenantId),
    uniqueUserTenant: uniqueIndex('user_tenants_unique').on(table.userId, table.tenantId)
  })
);



