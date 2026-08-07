import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleDatabase } from '../../database/database.types';

/** Document kinds that carry a customer-visible sequential number. */
export const DOCUMENT_SEQUENCE = {
  DEAL: 'deal',
  BOOKING: 'booking',
  RECEIPT: 'receipt'
} as const;

export type DocumentSequenceType =
  (typeof DOCUMENT_SEQUENCE)[keyof typeof DOCUMENT_SEQUENCE];

const PREFIX: Record<DocumentSequenceType, string> = {
  deal: 'DL',
  booking: 'BK',
  receipt: 'RC'
};

/** Anything that can run a query: the pool handle or an open transaction. */
type Executor = DrizzleDatabase | Parameters<DrizzleDatabase['transaction']>[0];

/**
 * Issues gapless, collision-free document numbers such as `DL-2026-0001`.
 *
 * The previous implementation counted existing rows and added one, which meant
 * two simultaneous requests both read N and both wrote N+1 — producing duplicate
 * deal numbers with no constraint to reject them. Here the counter row is locked
 * with `ON CONFLICT DO UPDATE`, so concurrent callers serialise on it and each
 * gets a distinct value.
 *
 * Always call this inside the same transaction that inserts the document: if the
 * insert rolls back, the counter rolls back with it.
 */
@Injectable()
export class DocumentNumberService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async next(
    executor: Executor,
    tenantId: string,
    docType: DocumentSequenceType,
    at: Date = new Date()
  ): Promise<string> {
    const year = at.getFullYear();
    const runner = (executor ?? this.db) as DrizzleDatabase;

    // Atomic read-modify-write: the UPDATE branch takes a row lock, so parallel
    // callers queue behind it rather than reading the same value.
    const result = await runner.execute(sql`
      INSERT INTO document_sequences (tenant_id, doc_type, year, last_value)
      VALUES (${tenantId}, ${docType}, ${year}, 1)
      ON CONFLICT (tenant_id, doc_type, year)
      DO UPDATE SET last_value = document_sequences.last_value + 1
      RETURNING last_value
    `);

    const rows = (result as unknown as { rows?: Array<{ last_value: number }> }).rows
      ?? (result as unknown as Array<{ last_value: number }>);
    const value = Number(rows?.[0]?.last_value ?? 0);

    return `${PREFIX[docType]}-${year}-${value.toString().padStart(4, '0')}`;
  }
}
