import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

export const permissions = pgTable(
  'permissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    code: varchar('code', { length: 255 }).notNull(),
    moduleSlug: varchar('module_slug', { length: 255 }).notNull()
  },
  (table) => ({
    codeUnique: uniqueIndex('permissions_code_uq').on(table.code)
  })
);





