import {
  mysqlTable,
  varchar,
  timestamp,
  uniqueIndex,
  mysqlEnum
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    roleGlobal: mysqlEnum('role_global', ['super_admin', 'normal']).default('normal').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .onUpdateNow()
      .notNull()
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_uq').on(table.email)
  })
);



