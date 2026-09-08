/**
 * Shared Neon/`pg` `Pool` tuning and Cloud Run fail-fast check, applied
 * identically everywhere this app opens a pooled Postgres connection --
 * `src/lib/db.ts`'s app-data pool and `src/lib/auth/server.ts`'s independent
 * Better Auth pool. Both pools hit the same Neon project from the same Cloud
 * Run service, so both need the same bound `max` and timeouts rather than
 * each defaulting to `pg`'s unbounded pool.
 *
 * Assumes `DATABASE_URL` is Neon's pooled endpoint (hostname contains
 * `-pooler`, PgBouncer in front) -- the direct endpoint has a much lower
 * connection ceiling and these settings would undersell it.
 */
export const NEON_POOL_OPTIONS = {
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
} as const;

/**
 * Fail at module load -- process boot on Cloud Run, not the first request --
 * when this is a real Cloud Run service with `DATABASE_URL` unset. `K_SERVICE`
 * is injected by Cloud Run itself into every real revision (deployed or a
 * `--no-traffic` candidate), which is why this checks it instead of
 * `NODE_ENV === 'production'`: the live-preview sandbox also runs with
 * `NODE_ENV=production` but has no `K_SERVICE`, and legitimately has no
 * `DATABASE_URL` by design (see db.ts's PGLite fallback) -- gating on
 * `NODE_ENV` alone would have broken preview.
 *
 * Without this, a missing `DATABASE_URL` on Cloud Run silently falls back to
 * an ephemeral, per-process PGLite database: reads never touch the real DB
 * connection so they still succeed, and the first thing a parent sees is a
 * signup 500 when the first write finally does. (This is exactly what
 * happened in production once already.) A no-op everywhere else (local dev,
 * live preview, CI), where `K_SERVICE` is never set.
 */
export function requireDatabaseUrlOnCloudRun(
  databaseUrl: string | undefined,
  context: string,
): void {
  if (typeof process === "undefined" || typeof window !== "undefined") return;
  if (process.env.K_SERVICE && !databaseUrl) {
    throw new Error(
      `${context}: DATABASE_URL is not set, but this process is running on ` +
        `Cloud Run (K_SERVICE=${process.env.K_SERVICE}) -- refusing to silently ` +
        `fall back to the ephemeral PGLite database. Set DATABASE_URL on the ` +
        `Cloud Run service.`,
    );
  }
}
