#!/usr/bin/env node
/**
 * Day-8 safety-valve lever (commerce spec §8): extend a household's trial
 * without hand-writing SQL against production. Inserts one append-only
 * admin_action row and nothing else -- recomputeSubscription folds
 * admin_action into `subscription` fresh on every real read
 * (getEntitlementForHousehold / getHomeState / getParentOverview), so the
 * extension takes effect the next time anyone in that household loads the
 * app or the parent dashboard. No separate "apply" step, no restart.
 *
 * This never overwrites or deletes anything (admin_action is append-only by
 * design, spec §8: "every manual intervention is logged, forever") and it
 * survives the next webhook recompute, since it's folded into the same
 * derivation as billing_event, not layered on top of a cached state.
 *
 * Usage:
 *   DATABASE_URL=<production Neon URL> node scripts/extend-trial.mjs \
 *     --household hh_xxxxxxxx --days 14 --reason "checkout not verified by day 8" --actor "founder"
 *
 * Refuses to run without DATABASE_URL set, so it can't accidentally target
 * the local PGLite dev fallback and look like it worked.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const householdId = arg("household");
const days = Number(arg("days"));
const reason = arg("reason");
const actor = arg("actor");

function usage() {
  console.error(
    'Usage: DATABASE_URL=<production Neon URL> node scripts/extend-trial.mjs --household <id> --days <n> --reason "<text>" --actor "<name>"',
  );
}

if (!householdId || !Number.isFinite(days) || days <= 0 || !reason || !actor) {
  usage();
  process.exit(1);
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  console.error("DATABASE_URL is not set -- refusing to run, so this can't silently target the local PGLite fallback.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const existing = await pool.query("select id from household where id = $1", [householdId]);
  if (existing.rows.length === 0) {
    console.error(`No household with id "${householdId}" -- double-check the id before proceeding.`);
    process.exit(1);
  }

  const id = `aa_${randomUUID()}`;
  await pool.query(
    `insert into admin_action (id, household_id, type, days, reason, actor)
     values ($1, $2, 'trial_extended', $3, $4, $5)`,
    [id, householdId, days, reason, actor],
  );
  console.log(
    `Recorded: household ${householdId} trial extended by ${days} day(s), reason "${reason}", actor "${actor}".`,
  );
  console.log("Takes effect on this household's next app or parent-dashboard load -- no restart needed.");
} finally {
  await pool.end();
}
