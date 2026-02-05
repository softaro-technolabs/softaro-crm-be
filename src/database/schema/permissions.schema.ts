import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

export const permissions = pgTable(
  'master_permissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    action: varchar('action', { length: 50 }).notNull(), // e.g. read, write, create, delete
    description: varchar('description', { length: 255 })
  },
  (table) => ({
    actionUnique: uniqueIndex('master_permissions_action_uq').on(table.action)
  })
);





