import {
  pgTable,
  timestamp,
  varchar,
  index,
  jsonb
} from 'drizzle-orm/pg-core';
import { leads } from './leads.schema';

export const contacts = pgTable(
  'contacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    alternatePhone: varchar('alternate_phone', { length: 50 }),
    address: jsonb('address'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    country: varchar('country', { length: 100 }),
    pincode: varchar('pincode', { length: 20 }),
    occupation: varchar('occupation', { length: 255 }),
    company: varchar('company', { length: 255 }),
    panNumber: varchar('pan_number', { length: 20 }),
    aadhaarNumber: varchar('aadhaar_number', { length: 20 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('contacts_tenant_idx').on(table.tenantId),
    emailIdx: index('contacts_email_idx').on(table.email),
    phoneIdx: index('contacts_phone_idx').on(table.phone)
  })
);
