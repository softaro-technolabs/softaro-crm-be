import { mysqlTable, varchar, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    roleId: varchar('role_id', { length: 36 }).notNull(),
    permissionId: varchar('permission_id', { length: 36 }).notNull()
  },
  (table) => ({
    tenantIdx: index('role_permissions_tenant_idx').on(table.tenantId),
    roleIdx: index('role_permissions_role_idx').on(table.roleId),
    permissionIdx: index('role_permissions_permission_idx').on(table.permissionId),
    uniqueRolePermission: uniqueIndex('role_permissions_unique').on(
      table.tenantId,
      table.roleId,
      table.permissionId
    )
  })
);



