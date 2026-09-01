import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";
import {
  backfillSurfaceSeenFromProgress,
  insertMissingSurfaceSeen,
  loadSurfaceSeenByKanji,
  parseStringList,
  unionSurfaceIds,
} from "../src/lib/server/surface-seen.ts";

function toSql(pg: PGlite) {
  const run = async <T>(text: string, params: unknown[] = []) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as {
    <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
    query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  };
  sql.query = run;
  return sql;
}

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

test("empty PGLite applies 0008_surface_seen.sql with no error", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pg);
  const tables = await pg.query<{ relname: string }>(
    "select relname from pg_class where relname = 'surface_seen'",
  );
  assert.equal(tables.rows.length, 1);
  const cols = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_name = 'inspections' and column_name = 'due_at'`,
  );
  assert.equal(cols.rows.length, 1);
  const echo = await pg.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_name = 'kanji_progress' and column_name = 'echo_success_count'`,
  );
  assert.ok(echo.rows.length >= 1);
});

test("logged-in meaning success on S lands in surface_seen and JSON after reload", async () => {
  const pg = new PGlite();
  await pg.waitReady;
  await applyMigrations(pg);
  const sql = toSql(pg);
  const userId = "user-1";
  const childId = "child-1";
  const kanji = "山";
  const S = "山:solo";

  await pg.query(
    `insert into children (id, user_id, name, grade) values ($1,$2,$3,$4)`,
    [childId, userId, "そら", 1],
  );

  const stateJson = JSON.stringify([S]);
  await pg.query(
    `insert into kanji_progress (
      user_id, child_id, kanji, status, surfaces_seen_success, echo_success_count
    ) values ($1,$2,$3,'almost',$4,0)`,
    [userId, childId, kanji, stateJson],
  );

  await insertMissingSurfaceSeen(sql, userId, childId, kanji, [S]);

  const tableRows = await pg.query<{ surface_id: string; kanji: string }>(
    `select kanji, surface_id from surface_seen where child_id = $1 and user_id = $2`,
    [childId, userId],
  );
  assert.equal(tableRows.rows.length, 1);
  assert.equal(tableRows.rows[0]?.surface_id, S);

  const jsonRows = await pg.query<{ surfaces_seen_success: string }>(
    `select surfaces_seen_success from kanji_progress where child_id = $1 and kanji = $2`,
    [childId, kanji],
  );
  assert.deepEqual(parseStringList(jsonRows.rows[0]?.surfaces_seen_success), [S]);

  await pg.query(
    `update kanji_progress set surfaces_seen_success = '[]' where child_id = $1 and kanji = $2`,
    [childId, kanji],
  );
  const seen = await loadSurfaceSeenByKanji(sql, userId, childId);
  const hydrated = unionSurfaceIds(
    parseStringList("[]"),
    seen.get(kanji) ?? [],
  );
  assert.ok(hydrated.includes(S));

  await pg.query(
    `delete from surface_seen where child_id = $1`,
    [childId],
  );
  await pg.query(
    `update kanji_progress set surfaces_seen_success = $1 where child_id = $2 and kanji = $3`,
    [JSON.stringify([S]), childId, kanji],
  );
  await backfillSurfaceSeenFromProgress(sql, userId, childId);
  const after = await pg.query<{ surface_id: string }>(
    `select surface_id from surface_seen where child_id = $1 and surface_id = $2`,
    [childId, S],
  );
  assert.equal(after.rows.length, 1);
});

test("progress.ts keeps JSON, appends surface_seen, hydrates union; no guest store", async () => {
  const src = await readFile("src/lib/server/progress.ts", "utf8");
  assert.match(src, /insertMissingSurfaceSeen/);
  assert.match(src, /unionSurfaceIds/);
  assert.match(src, /backfillSurfaceSeenFromProgress/);
  assert.match(src, /JSON\.stringify\(state\.surfacesSeenSuccess/);
  assert.equal(/ほぞんする/.test(src), false);
  assert.equal(/guest-ride|localStorage/.test(src), false);
  const evalSrc = await readFile("src/lib/progress-eval.ts", "utf8");
  assert.ok(evalSrc.length > 0);
});
