import {
  pgTable,
  varchar,
  boolean,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';

export const tenantModules = pgTable(
  'tenant_modules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    moduleId: varchar('module_id', { length: 36 }).notNull(),
    isEnabled: boolean('is_enabled').default(true).notNull()
  },
  (table) => ({
    tenantIdx: index('tenant_modules_tenant_idx').on(table.tenantId),
    moduleIdx: index('tenant_modules_module_idx').on(table.moduleId),
    uniqueTenantModule: uniqueIndex('tenant_modules_unique').on(table.tenantId, table.moduleId)
  })
);





