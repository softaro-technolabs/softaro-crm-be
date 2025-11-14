import { mysqlTable, varchar, uniqueIndex } from 'drizzle-orm/mysql-core';

export const modules = mysqlTable(
  'modules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    defaultRoute: varchar('default_route', { length: 255 }).notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex('modules_slug_uq').on(table.slug)
  })
);





