/**
 * DB-reachability probe, checked by scripts/smoke-production.mjs before
 * traffic is promoted to a new revision -- catches a misconfigured or
 * unreachable DATABASE_URL (wrong host, exhausted Neon connection limit,
 * pooler down) at deploy time instead of on a parent's first signup.
 *
 * Not wired into Cloud Run's own health probes: those gate container
 * readiness/liveness (restart policy), which is the wrong lever for "the
 * database is unreachable" -- restarting a healthy container won't fix a
 * bad connection string. This route is deliberately probed only by the
 * smoke test, which already gates promotion for the routing-contract checks.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/health-db")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          await sql`select 1`;
          return json(200, { ok: true });
        } catch (err) {
          console.error("health-db: query failed:", err);
          return json(503, { ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
  },
});
