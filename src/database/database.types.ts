import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema';

export type DrizzleDatabase = NodePgDatabase<typeof schema>;

/**
 * An open transaction handle, as passed to a `db.transaction(async (tx) => …)`
 * callback.
 *
 * Note it is the *first parameter of the callback*, not the first parameter of
 * `transaction` itself — that one is the callback. Getting this wrong yields a
 * function type that silently has no `.insert`, which is why older helpers in
 * this codebase take a loose union and cast it away.
 */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

/** Anything that can run a query: the pool handle or an open transaction. */
export type DrizzleExecutor = DrizzleDatabase | DrizzleTransaction;





