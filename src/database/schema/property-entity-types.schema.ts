import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Tenant-scoped master list for property entity types.
 * Allows each tenant to define the types of property entities they manage
 * (e.g. Project, Tower, Wing, Villa, Plotted Development, Township, etc.)
 * following Indian real estate industry nomenclature.
 */
export const propertyEntityTypes = pgTable(
  'property_entity_types',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    order: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('prop_entity_types_tenant_idx').on(table.tenantId),
    tenantValueUniq: uniqueIndex('prop_entity_types_tenant_value_uq').on(
      table.tenantId,
      table.value,
    ),
  }),
);
