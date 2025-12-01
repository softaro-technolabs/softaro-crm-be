import {
  pgTable,
  varchar,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
  timestamp
} from 'drizzle-orm/pg-core';

export const userTenantStatusEnum = pgEnum('user_tenant_status', ['active', 'pending', 'disabled']);

export const userTenants = pgTable(
  'user_tenants',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    roleId: varchar('role_id', { length: 36 }),
    status: userTenantStatusEnum('status').default('pending').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userIdx: index('user_tenants_user_idx').on(table.userId),
    tenantIdx: index('user_tenants_tenant_idx').on(table.tenantId),
    uniqueUserTenant: uniqueIndex('user_tenants_unique').on(table.userId, table.tenantId)
  })
);





