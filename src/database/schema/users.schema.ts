import {
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
  pgEnum
} from 'drizzle-orm/pg-core';

export const roleGlobalEnum = pgEnum('role_global', ['super_admin', 'normal']);

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    roleGlobal: roleGlobalEnum('role_global').default('normal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_uq').on(table.email)
  })
);





