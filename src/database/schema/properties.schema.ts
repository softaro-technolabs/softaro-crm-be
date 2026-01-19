import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
  integer
} from 'drizzle-orm/pg-core';

/**
 * Property Module (multi-tenant)
 * - property_entities: root table for all real-estate entities (projects/buildings/plots/units/land/villas)
 * - property_units: sellable inventory (a unit belongs to an entity)
 * - property_locations: normalized address/location for any entity
 * - property_attributes + property_attribute_values: flexible metadata system
 * - property_media: files for entity/unit
 * - property_status_logs: status history for units
 * - lead_property_interests: link leads to any unit
 * - property_pricing_breakups: optional pricing details for units
 */

export const propertyEntityTypeEnum = pgEnum('property_entity_type', [
  'project',
  'building',
  'plot',
  'unit',
  'land',
  'villa'
]);

export const propertyEntityStatusEnum = pgEnum('property_entity_status', ['active', 'inactive']);

export const propertyUnitStatusEnum = pgEnum('property_unit_status', ['available', 'blocked', 'booked', 'sold']);

export const propertyAttributeDataTypeEnum = pgEnum('property_attribute_data_type', [
  'text',
  'number',
  'boolean',
  'select'
]);

export const propertyAttributeScopeEnum = pgEnum('property_attribute_scope', ['entity', 'unit']);

export const propertyMediaTypeEnum = pgEnum('property_media_type', ['image', 'pdf', 'video']);

export const leadInterestLevelEnum = pgEnum('lead_interest_level', ['hot', 'warm', 'cold']);

export const propertyEntities = pgTable(
  'property_entities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    parentId: varchar('parent_id', { length: 36 }),
    entityType: propertyEntityTypeEnum('entity_type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: propertyEntityStatusEnum('status').default('active').notNull(),
    description: varchar('description', { length: 2000 }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('property_entities_tenant_idx').on(table.tenantId),
    tenantParentIdx: index('property_entities_tenant_parent_idx').on(table.tenantId, table.parentId),
    tenantTypeIdx: index('property_entities_tenant_type_idx').on(table.tenantId, table.entityType),
    tenantStatusIdx: index('property_entities_tenant_status_idx').on(table.tenantId, table.status)
  })
);

export const propertyUnits = pgTable(
  'property_units',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    unitCode: varchar('unit_code', { length: 80 }).notNull(),
    price: numeric('price', { precision: 15, scale: 2 }),
    pricePerSqft: numeric('price_per_sqft', { precision: 15, scale: 2 }),
    unitStatus: propertyUnitStatusEnum('unit_status').default('available').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('property_units_tenant_idx').on(table.tenantId),
    tenantEntityIdx: index('property_units_tenant_entity_idx').on(table.tenantId, table.entityId),
    tenantStatusIdx: index('property_units_tenant_status_idx').on(table.tenantId, table.unitStatus),
    tenantEntityUnitCodeUnique: uniqueIndex('property_units_tenant_entity_unit_code_uq').on(
      table.tenantId,
      table.entityId,
      table.unitCode
    )
  })
);

export const propertyLocations = pgTable(
  'property_locations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    addressLine: varchar('address_line', { length: 500 }),
    area: varchar('area', { length: 255 }),
    city: varchar('city', { length: 120 }),
    state: varchar('state', { length: 120 }),
    country: varchar('country', { length: 120 }),
    pincode: varchar('pincode', { length: 20 }),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 })
  },
  (table) => ({
    tenantIdx: index('property_locations_tenant_idx').on(table.tenantId),
    tenantEntityUnique: uniqueIndex('property_locations_tenant_entity_uq').on(table.tenantId, table.entityId)
  })
);

export const propertyAttributes = pgTable(
  'property_attributes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    dataType: propertyAttributeDataTypeEnum('data_type').notNull(),
    scope: propertyAttributeScopeEnum('scope').notNull()
  },
  (table) => ({
    tenantIdx: index('property_attributes_tenant_idx').on(table.tenantId),
    tenantNameUnique: uniqueIndex('property_attributes_tenant_name_uq').on(table.tenantId, table.name),
    tenantScopeIdx: index('property_attributes_tenant_scope_idx').on(table.tenantId, table.scope)
  })
);

export const propertyAttributeValues = pgTable(
  'property_attribute_values',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    attributeId: varchar('attribute_id', { length: 36 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }),
    unitId: varchar('unit_id', { length: 36 }),
    value: varchar('value', { length: 2000 })
  },
  (table) => ({
    tenantIdx: index('property_attribute_values_tenant_idx').on(table.tenantId),
    tenantAttributeIdx: index('property_attribute_values_tenant_attribute_idx').on(table.tenantId, table.attributeId),
    tenantEntityIdx: index('property_attribute_values_tenant_entity_idx').on(table.tenantId, table.entityId),
    tenantUnitIdx: index('property_attribute_values_tenant_unit_idx').on(table.tenantId, table.unitId),
    tenantEntityAttributeUnique: uniqueIndex('property_attr_values_tenant_entity_attr_uq').on(
      table.tenantId,
      table.entityId,
      table.attributeId
    ),
    tenantUnitAttributeUnique: uniqueIndex('property_attr_values_tenant_unit_attr_uq').on(
      table.tenantId,
      table.unitId,
      table.attributeId
    )
  })
);

export const propertyMedia = pgTable(
  'property_media',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    unitId: varchar('unit_id', { length: 36 }),
    mediaType: propertyMediaTypeEnum('media_type').notNull(),
    fileUrl: varchar('file_url', { length: 2000 }).notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('property_media_tenant_idx').on(table.tenantId),
    tenantEntityIdx: index('property_media_tenant_entity_idx').on(table.tenantId, table.entityId),
    tenantUnitIdx: index('property_media_tenant_unit_idx').on(table.tenantId, table.unitId)
  })
);

export const propertyStatusLogs = pgTable(
  'property_status_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    unitId: varchar('unit_id', { length: 36 }).notNull(),
    oldStatus: propertyUnitStatusEnum('old_status'),
    newStatus: propertyUnitStatusEnum('new_status').notNull(),
    changedByUserId: varchar('changed_by_user_id', { length: 36 }),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
    remarks: varchar('remarks', { length: 2000 })
  },
  (table) => ({
    tenantIdx: index('property_status_logs_tenant_idx').on(table.tenantId),
    tenantUnitTimeIdx: index('property_status_logs_tenant_unit_time_idx').on(table.tenantId, table.unitId, table.changedAt)
  })
);

export const leadPropertyInterests = pgTable(
  'lead_property_interests',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    unitId: varchar('unit_id', { length: 36 }).notNull(),
    interestLevel: leadInterestLevelEnum('interest_level').default('warm').notNull(),
    visitDate: timestamp('visit_date', { withTimezone: true }),
    visitStatus: varchar('visit_status', { length: 120 }),
    notes: varchar('notes', { length: 2000 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('lead_property_interests_tenant_idx').on(table.tenantId),
    tenantLeadIdx: index('lead_property_interests_tenant_lead_idx').on(table.tenantId, table.leadId),
    tenantUnitIdx: index('lead_property_interests_tenant_unit_idx').on(table.tenantId, table.unitId),
    tenantLeadUnitUnique: uniqueIndex('lead_property_interests_tenant_lead_unit_uq').on(
      table.tenantId,
      table.leadId,
      table.unitId
    )
  })
);

export const propertyPricingBreakups = pgTable(
  'property_pricing_breakups',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    unitId: varchar('unit_id', { length: 36 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull()
  },
  (table) => ({
    tenantIdx: index('property_pricing_breakups_tenant_idx').on(table.tenantId),
    tenantUnitIdx: index('property_pricing_breakups_tenant_unit_idx').on(table.tenantId, table.unitId)
  })
);

