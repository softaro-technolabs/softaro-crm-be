import { pgTable, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

export const modules = pgTable(
  'modules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    defaultRoute: varchar('default_route', { length: 255 }).notNull(),
    parentId: varchar('parent_id', { length: 36 })
  },
  (table) => ({
    slugUnique: uniqueIndex('modules_slug_uq').on(table.slug)
  })
);





