import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
  text
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leads } from './leads.schema';
import { propertyUnits } from './properties.schema';

export const quotationStatusEnum = pgEnum('quotation_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted'
]);

export const quotations = pgTable(
  'quotations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull().references(() => leads.id, { onDelete: 'cascade' }),
    propertyUnitId: varchar('property_unit_id', { length: 36 }).references(() => propertyUnits.id, { onDelete: 'set null' }),
    quotationNumber: varchar('quotation_number', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    status: quotationStatusEnum('status').default('draft').notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow().notNull(),
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    currency: varchar('currency', { length: 10 }).default('INR').notNull(),
    subTotal: numeric('sub_total', { precision: 15, scale: 2 }).default('0').notNull(),
    taxTotal: numeric('tax_total', { precision: 15, scale: 2 }).default('0').notNull(),
    discountTotal: numeric('discount_total', { precision: 15, scale: 2 }).default('0').notNull(),
    grandTotal: numeric('grand_total', { precision: 15, scale: 2 }).default('0').notNull(),
    // Unit Details (Cost Sheet specific)
    projectName: varchar('project_name', { length: 255 }),
    unitNumber: varchar('unit_number', { length: 50 }),
    floorTower: varchar('floor_tower', { length: 100 }),
    unitType: varchar('unit_type', { length: 100 }),
    carpetArea: varchar('carpet_area', { length: 100 }),
    superBuiltUp: varchar('super_built_up', { length: 100 }),
    possession: varchar('possession', { length: 100 }),
    paymentPlan: varchar('payment_plan', { length: 255 }),

    // Pricing Breakdown (Cost Sheet specific)
    basePrice: numeric('base_price', { precision: 15, scale: 2 }).default('0'),
    plc: numeric('plc', { precision: 15, scale: 2 }).default('0'),
    parking: numeric('parking', { precision: 15, scale: 2 }).default('0'),
    clubMembership: numeric('club_membership', { precision: 15, scale: 2 }).default('0'),
    gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).default('5'),
    gstAmount: numeric('gst_amount', { precision: 15, scale: 2 }).default('0'),
    stampDuty: numeric('stamp_duty', { precision: 15, scale: 2 }).default('0'),
    discount: numeric('discount', { precision: 15, scale: 2 }).default('0'),
    otherCharges: jsonb('other_charges').default('[]'),

    notes: text('notes'),
    terms: text('terms'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('quotations_tenant_idx').on(table.tenantId),
    leadIdx: index('quotations_lead_idx').on(table.leadId),
    tenantQuotationNumberUnique: uniqueIndex('quotations_tenant_number_uq').on(table.tenantId, table.quotationNumber),
    statusIdx: index('quotations_status_idx').on(table.status)
  })
);

export const quotationItems = pgTable(
  'quotation_items',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    quotationId: varchar('quotation_id', { length: 36 }).notNull().references(() => quotations.id, { onDelete: 'cascade' }),
    propertyUnitId: varchar('property_unit_id', { length: 36 }).references(() => propertyUnits.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 15, scale: 2 }).default('1').notNull(),
    unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).default('0').notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('0').notNull(), // Percentage
    discountRate: numeric('discount_rate', { precision: 5, scale: 2 }).default('0').notNull(), // Percentage
    total: numeric('total', { precision: 15, scale: 2 }).default('0').notNull(),
    order: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    quotationIdx: index('quotation_items_quotation_idx').on(table.quotationId)
  })
);
