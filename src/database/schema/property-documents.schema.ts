import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';

export const propertyDocumentTypeEnum = pgEnum('property_document_type', [
  'cost_sheet',
  'quotation',
  'booking_form',
  'allotment_letter',
  'payment_receipt'
]);

export const propertyDocuments = pgTable(
  'property_documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    propertyUnitId: varchar('property_unit_id', { length: 36 }),
    type: propertyDocumentTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    fileUrl: varchar('file_url', { length: 2000 }), // If stored in S3/Cloudinary
    content: text('content'), // JSON or HTML representation if stored locally
    metadata: text('metadata'), // JSON string for extra info
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('property_docs_tenant_idx').on(table.tenantId),
    leadIdx: index('property_docs_lead_idx').on(table.leadId),
    unitIdx: index('property_docs_unit_idx').on(table.propertyUnitId)
  })
);
