import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';

import { leads } from './leads.schema';
import { users } from './users.schema';
import { propertyEntities } from './properties.schema';

export const siteVisitStatusEnum = pgEnum('site_visit_status', [
  'scheduled',
  'completed',
  'cancelled',
  'no_show'
]);

export const siteVisits = pgTable(
  'site_visits',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    propertyId: varchar('property_id', { length: 36 }).references(() => propertyEntities.id, { onDelete: 'cascade' }),
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
    visitDate: timestamp('visit_date', { withTimezone: true }).notNull(),
    status: siteVisitStatusEnum('status').default('scheduled').notNull(),
    feedback: text('feedback'),
    rating: integer('rating'), // 1-5
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('site_visits_tenant_idx').on(table.tenantId),
    leadIdx: index('site_visits_lead_idx').on(table.leadId),
    propertyIdx: index('site_visits_property_idx').on(table.propertyId),
    statusIdx: index('site_visits_status_idx').on(table.status),
    visitDateIdx: index('site_visits_date_idx').on(table.visitDate)
  })
);
