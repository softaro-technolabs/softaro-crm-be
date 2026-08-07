import { integer, pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core';

/**
 * Per-tenant, per-year counters for human-readable document numbers
 * (deal numbers, booking numbers, receipt numbers…).
 *
 * Replaces the previous `count(*) + 1` approach, which had two defects:
 * two concurrent creations produced the SAME number, and deleting a row
 * caused the next creation to reuse a number that had already been issued
 * to a customer.
 *
 * Allocation must happen inside the caller's transaction via
 * `DocumentNumberService.next()`, which takes a row lock on the counter.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    /** 'deal' | 'booking' | 'receipt' — see DOCUMENT_SEQUENCE. */
    docType: varchar('doc_type', { length: 30 }).notNull(),
    /** Calendar year the counter belongs to; counters restart each year. */
    year: integer('year').notNull(),
    /** Highest number issued so far. The next issued number is this + 1. */
    lastValue: integer('last_value').default(0).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.docType, table.year] })
  })
);
