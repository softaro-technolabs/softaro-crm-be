import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const leadOptionTypeEnum = pgEnum('lead_option_type', [
  'requirement_type',
  'property_type',
  'property_category',
  'capture_channel',
]);

/**
 * Tenant-scoped master list for lead dropdown fields.
 * Replaces hard-coded options for Requirement Type, Property Type,
 * Property Category and Capture Channel so each tenant can customise them.
 */
export const leadOptions = pgTable(
  'lead_options',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    type: leadOptionTypeEnum('type').notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    order: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantTypeIdx: index('lead_options_tenant_type_idx').on(table.tenantId, table.type),
    tenantTypeValueUniq: uniqueIndex('lead_options_tenant_type_value_uq').on(
      table.tenantId,
      table.type,
      table.value,
    ),
  }),
);
