/**
 * The one convention for serialising concurrent mutations of a single
 * household.
 *
 * Two requests that both read "this household has 2 children" and both then
 * insert a third produce 4 children under a cap of 3 -- the count and the
 * insert are two statements, and nothing between them stops the other
 * request. A `SELECT ... FOR UPDATE` on the household row would work for
 * that one case, but not for `createChild`, whose decision reads `children`
 * and `subscription` and writes `children` and `household`: there is no
 * single row to lock. An advisory lock keyed by household id covers all of
 * it, at the price of everyone agreeing to take it.
 *
 * Everything that mutates a household under contention goes through this:
 * createChild, assignAnnualPass, archiveChild, resolveHouseholdId's creation
 * path, and the orders/paid webhook's household resolution.
 */

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/**
 * Namespace for every advisory lock this app takes. Arbitrary and fixed:
 * its only job is to keep these locks from colliding with a lock some other
 * part of the system (or a future one) takes on a numerically equal key.
 * Postgres advisory locks are a single global integer space with no
 * ownership -- nothing prevents a collision except everyone picking
 * different namespaces.
 */
export const HOUSEHOLD_LOCK_NS = 4711;

/**
 * Take the household's lock, then run `fn`.
 *
 * `pg_advisory_xact_lock`, never `pg_advisory_lock`: the transaction-scoped
 * form is released by COMMIT or ROLLBACK, including the rollback an
 * unhandled error triggers. The session-scoped form has to be released by
 * hand, so any path that throws before its unlock leaks the lock -- and
 * because a pooled connection is reused rather than closed, that wedges
 * every later request for that household until the connection is recycled.
 * There is no timeout on a wait for an advisory lock.
 *
 * `sql` MUST be a transaction handle from withTransaction() (src/lib/db.ts),
 * not the pooled client: the pooled client sends each statement to whichever
 * connection is free, so the lock would be taken on one connection and the
 * work done on others -- holding nothing, blocking nobody, and looking
 * exactly like working code.
 *
 * hashtext() maps the text id into the int4 the lock's second key must be.
 * Collisions are possible (two households hashing alike just wait for each
 * other) and harmless -- it costs contention, never correctness.
 */
export async function withHouseholdLock<T>(
  sql: Sql,
  householdId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await sql`select pg_advisory_xact_lock(${HOUSEHOLD_LOCK_NS}, hashtext(${householdId}))`;
  return fn();
}
