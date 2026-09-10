import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";

/**
 * Exercises migrations/0013_child_lifecycle.sql -- the schema (archived_at,
 * idempotency_key, its unique index, the FK constraints) and the one-time
 * exact-name dedup routine -- against a real PGlite instance, the same
 * pattern scripts/b1-surface-seen.test.ts uses. children.ts itself imports
 * `@/lib/auth/middleware`/`@/lib/db` (Vite path aliases the plain node test
 * runner can't resolve -- see admin-gate.ts's own split for the same
 * constraint elsewhere in this app), so createChild/renameChild/archiveChild
 * are verified functionally instead (real dev server + Playwright, not
 * node:test) -- this file covers the migration's own SQL, which is the
 * highest-risk, least-visited-by-any-other-test part of this change.
 */

async function applyMigrations(pg: PGlite) {
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const entries = await readdir("migrations");
  for (const { name } of pendingMigrations(entries, [])) {
    const text = await readFile(`migrations/${name}`, "utf8");
    await pg.exec(text);
    await pg.query("insert into _migrations (name) values ($1)", [name]);
  }
}

/** The dedup do-block, extracted from the migration file so re-running it in a test can't drift from what production actually runs. */
async function dedupBlock(): Promise<string> {
  const sql = await readFile("migrations/0013_child_lifecycle.sql", "utf8");
  const match = sql.match(/do \$\$[\s\S]*?end \$\$;/);
  if (!match) throw new Error("dedup do-block not found in 0013_child_lifecycle.sql");
  return match[0];
}

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pg);
  return pg;
}

async function insertChild(pg: PGlite, id: string, userId: string, name: string, createdAt: string) {
  await pg.query(`insert into children (id, user_id, name, grade, created_at) values ($1,$2,$3,1,$4)`, [
    id,
    userId,
    name,
    createdAt,
  ]);
}

test("0008/0002 schema still present -- baseline sanity, same check as b1-surface-seen.test.ts", async () => {
  const pg = await freshDb();
  const cols = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_name = 'children' and column_name in ('archived_at','idempotency_key')`,
  );
  assert.equal(cols.rows.length, 2);
});

test("children_user_idempotency_idx exists and enforces one row per (user_id, idempotency_key)", async () => {
  const pg = await freshDb();
  await pg.query(`insert into children (id, user_id, name, grade, idempotency_key) values ('c1','u1','Sora',1,'key-1')`);
  await assert.rejects(() =>
    pg.query(`insert into children (id, user_id, name, grade, idempotency_key) values ('c2','u1','Sora Again',1,'key-1')`),
  );
  // A different user reusing the same key is fine -- the index is scoped per user.
  await pg.query(`insert into children (id, user_id, name, grade, idempotency_key) values ('c3','u2','Sora',1,'key-1')`);
  // NULL keys (every child created before this migration) never collide with each other.
  await pg.query(`insert into children (id, user_id, name, grade) values ('c4','u1','No Key A',1)`);
  await pg.query(`insert into children (id, user_id, name, grade) values ('c5','u1','No Key B',1)`);
  // c1 (key-1) + c4 + c5 -- c2's insert above was rejected, never landed.
  const rows = await pg.query(`select id from children where user_id = 'u1'`);
  assert.equal(rows.rows.length, 3);
});

test("on conflict (user_id, idempotency_key) do nothing -- the exact retry pattern createChild uses -- returns no row on the second attempt", async () => {
  const pg = await freshDb();
  const first = await pg.query<{ id: string }>(
    `insert into children (id, user_id, name, grade, idempotency_key) values ('c1','u1','Sora',1,'key-1')
     on conflict (user_id, idempotency_key) do nothing returning id`,
  );
  assert.equal(first.rows.length, 1);
  const retry = await pg.query<{ id: string }>(
    `insert into children (id, user_id, name, grade, idempotency_key) values ('c2','u1','Sora',1,'key-1')
     on conflict (user_id, idempotency_key) do nothing returning id`,
  );
  assert.equal(retry.rows.length, 0);
  const total = await pg.query(`select id from children where user_id = 'u1'`);
  assert.equal(total.rows.length, 1);
});

test("kanji_progress/child_stamps/grade_routes/inspections/surface_seen/practice_events FK constraints exist and block deleting a referenced child", async () => {
  const pg = await freshDb();
  const constraints = await pg.query<{ conname: string }>(
    `select conname from pg_constraint where conname in (
      'kanji_progress_child_id_fkey', 'practice_events_child_id_fkey', 'child_stamps_child_id_fkey',
      'grade_routes_child_id_fkey', 'inspections_child_id_fkey', 'surface_seen_child_id_fkey'
    )`,
  );
  assert.equal(constraints.rows.length, 6);

  await insertChild(pg, "c1", "u1", "Sora", "2026-01-01T00:00:00Z");
  await pg.query(
    `insert into kanji_progress (user_id, child_id, kanji, status) values ('u1','c1','山','new')`,
  );
  // Deletion fails safely (a real DB error), not a silent no-op and not a
  // silent cascade destroying the progress row.
  await assert.rejects(() => pg.query(`delete from children where id = 'c1'`));
  const stillThere = await pg.query(`select id from kanji_progress where child_id = 'c1'`);
  assert.equal(stillThere.rows.length, 1);

  // A child with zero progress rows is unaffected by the constraint.
  await insertChild(pg, "c2", "u1", "Empty", "2026-01-01T00:00:00Z");
  await pg.query(`delete from children where id = 'c2'`);
  const gone = await pg.query(`select id from children where id = 'c2'`);
  assert.equal(gone.rows.length, 0);
});

test("dedup: exactly one duplicate has progress -- keeps it, removes the zero-progress orphan", async () => {
  const pg = await freshDb();
  await insertChild(pg, "c-progress", "u1", "Brian2023", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c-orphan", "u1", "Brian2023", "2026-01-02T00:00:00Z");
  await pg.query(`insert into kanji_progress (user_id, child_id, kanji, status) values ('u1','c-progress','山','new')`);

  await pg.exec(await dedupBlock());

  const remaining = await pg.query<{ id: string }>(`select id from children where user_id = 'u1' and name = 'Brian2023'`);
  assert.equal(remaining.rows.length, 1);
  assert.equal(remaining.rows[0]?.id, "c-progress");
  const progressStillThere = await pg.query(`select id from kanji_progress where child_id = 'c-progress'`);
  assert.equal(progressStillThere.rows.length, 1);
});

test("dedup: neither duplicate has any progress -- keeps the oldest by created_at", async () => {
  const pg = await freshDb();
  await insertChild(pg, "c-old", "u1", "Brian2023", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c-new", "u1", "Brian2023", "2026-01-02T00:00:00Z");

  await pg.exec(await dedupBlock());

  const remaining = await pg.query<{ id: string }>(`select id from children where user_id = 'u1' and name = 'Brian2023'`);
  assert.equal(remaining.rows.length, 1);
  assert.equal(remaining.rows[0]?.id, "c-old");
});

test("dedup: both duplicates have progress -- ambiguous, touches nothing (fails safely rather than guessing)", async () => {
  const pg = await freshDb();
  await insertChild(pg, "c-a", "u1", "Brian2023", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c-b", "u1", "Brian2023", "2026-01-02T00:00:00Z");
  await pg.query(`insert into kanji_progress (user_id, child_id, kanji, status) values ('u1','c-a','山','new')`);
  await pg.query(`insert into kanji_progress (user_id, child_id, kanji, status) values ('u1','c-b','川','new')`);

  await pg.exec(await dedupBlock());

  const remaining = await pg.query(`select id from children where user_id = 'u1' and name = 'Brian2023'`);
  assert.equal(remaining.rows.length, 2);
});

test("dedup: different names, or different users with the same name, are never touched", async () => {
  const pg = await freshDb();
  await insertChild(pg, "c1", "u1", "Sora", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c2", "u1", "Yuki", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c3", "u2", "Sora", "2026-01-01T00:00:00Z");

  await pg.exec(await dedupBlock());

  const all = await pg.query(`select id from children`);
  assert.equal(all.rows.length, 3);
});

test("dedup routine is safe to run more than once (idempotent)", async () => {
  const pg = await freshDb();
  await insertChild(pg, "c-old", "u1", "Brian2023", "2026-01-01T00:00:00Z");
  await insertChild(pg, "c-new", "u1", "Brian2023", "2026-01-02T00:00:00Z");

  const block = await dedupBlock();
  await pg.exec(block);
  await pg.exec(block);
  await pg.exec(block);

  const remaining = await pg.query(`select id from children where user_id = 'u1' and name = 'Brian2023'`);
  assert.equal(remaining.rows.length, 1);
});
