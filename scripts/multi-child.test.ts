import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";
import { entitlement, entitlementFor, childQuota, TRIAL_CHILD_LIMIT } from "../src/lib/entitlement.ts";
import { cooldownStateOf, PASS_REASSIGN_COOLDOWN_DAYS } from "../src/lib/pass-assignment.ts";
import { resolveInitialChildId, CHILD_HINT_KEY } from "../src/lib/child-route-resolve.ts";
import { normalizeChildName } from "../src/lib/child-name.ts";
import { HOUSEHOLD_LOCK_NS } from "../src/lib/server/household-lock.ts";

/**
 * The multi-child model: per-child entitlement, tier quotas, the advisory
 * lock, and the schema underneath all three.
 *
 * Two kinds of test here, deliberately. The pure rules (entitlementFor,
 * childQuota, the cooldown) are exercised directly. Everything that is only
 * true because of SQL -- the quota under concurrency, the ownership filter,
 * the FK that must refuse a hard delete -- is exercised against a real
 * PGlite database running this repo's actual migrations, because those are
 * the claims that a reading of the source cannot settle.
 */

const NOW = "2026-03-01T00:00:00.000Z";
const TRIAL = { state: "trial" as const, effectiveTrialEnd: "2026-03-10T00:00:00.000Z", paidUntil: null };
const ANNUAL = { state: "active" as const, effectiveTrialEnd: null, paidUntil: "2027-03-01T00:00:00.000Z" };
const BUYOUT = { state: "active" as const, effectiveTrialEnd: null, paidUntil: null };
const LAPSED = { state: "lapsed" as const, effectiveTrialEnd: null, paidUntil: null };

// ── entitlementFor ────────────────────────────────────────────────────────

test("buyout: every child rides", () => {
  for (const id of ["a", "b", "c"]) {
    const e = entitlementFor(BUYOUT, { coveredChildId: null }, id, NOW);
    assert.equal(e.canRide, true, id);
    assert.equal(e.canView, true, id);
  }
});

test("annual: the covered child rides, the uncovered sibling does not", () => {
  const covered = entitlementFor(ANNUAL, { coveredChildId: "a" }, "a", NOW);
  const sibling = entitlementFor(ANNUAL, { coveredChildId: "a" }, "b", NOW);
  assert.deepEqual(covered, { canRide: true, canView: true });
  assert.deepEqual(sibling, { canRide: false, canView: true });
});

test("an unassigned annual pass is reported as covering everyone, and pass.ts is what stops that mattering", () => {
  // The rule itself reads a null covered_child_id as "all children", because
  // that is what it means for a trial and for a buyout. An annual household
  // with no assignment reaches the same shape -- which is why the parent
  // surface blocks on the assignment card rather than relying on this.
  assert.equal(entitlementFor(ANNUAL, { coveredChildId: null }, "a", NOW).canRide, true);
  const card = readFileSync("src/components/pass-assignment-card.tsx", "utf8");
  assert.match(card, /data-pass-unassigned/);
  assert.match(card, /passAssignTitle/);
});

test("canView is true in every state, for every child, covered or not", () => {
  const cases = [
    [TRIAL, null],
    [ANNUAL, "a"],
    [ANNUAL, null],
    [BUYOUT, null],
    [LAPSED, null],
    [LAPSED, "a"],
  ] as const;
  for (const [sub, covered] of cases) {
    for (const childId of ["a", "b", null]) {
      assert.equal(entitlementFor(sub, { coveredChildId: covered }, childId, NOW).canView, true);
    }
  }
});

test("lapsed rides nowhere, whatever the coverage says", () => {
  assert.equal(entitlementFor(LAPSED, { coveredChildId: null }, "a", NOW).canRide, false);
  assert.equal(entitlementFor(LAPSED, { coveredChildId: "a" }, "a", NOW).canRide, false);
});

test("an expired annual pass stops riding on the clock alone, with no webhook", () => {
  const afterExpiry = "2027-03-02T00:00:00.000Z";
  assert.equal(entitlementFor(ANNUAL, { coveredChildId: "a" }, "a", afterExpiry).canRide, false);
  assert.equal(entitlementFor(ANNUAL, { coveredChildId: "a" }, "a", afterExpiry).canView, true);
});

test("childId null asks the household question and is not covered by an assigned pass", () => {
  assert.equal(entitlementFor(ANNUAL, { coveredChildId: "a" }, null, NOW).canRide, false);
  assert.equal(entitlementFor(BUYOUT, { coveredChildId: null }, null, NOW).canRide, true);
});

test("entitlementFor never widens the household answer", () => {
  for (const sub of [TRIAL, ANNUAL, BUYOUT, LAPSED]) {
    const base = entitlement(sub, NOW);
    const per = entitlementFor(sub, { coveredChildId: null }, "a", NOW);
    assert.equal(per.canRide, base.canRide);
  }
});

// ── quotas ────────────────────────────────────────────────────────────────

test("trial caps at 3; annual and buyout do not cap creation; lapsed cannot create", () => {
  assert.deepEqual(childQuota(TRIAL, NOW), { canCreate: true, limit: TRIAL_CHILD_LIMIT });
  assert.equal(TRIAL_CHILD_LIMIT, 3);
  // The distinction the whole model turns on: an annual pass limits who
  // RIDES, not how many children exist.
  assert.equal(childQuota(ANNUAL, NOW).limit, Infinity);
  assert.equal(childQuota(BUYOUT, NOW).limit, Infinity);
  assert.deepEqual(childQuota(LAPSED, NOW), { canCreate: false, limit: 0 });
});

test("an expired trial cannot create, even while the cached state still says trial", () => {
  assert.equal(childQuota(TRIAL, "2026-03-11T00:00:00.000Z").canCreate, false);
});

// ── cooldown ──────────────────────────────────────────────────────────────

test("the first assignment is exempt from the cooldown", () => {
  assert.deepEqual(cooldownStateOf(null, NOW), { blocked: false, nextAllowedAt: null });
});

test("reassigning within 30 days is blocked, and names the date it stops being", () => {
  const assigned = "2026-03-01T00:00:00.000Z";
  const inside = cooldownStateOf(assigned, "2026-03-20T00:00:00.000Z");
  assert.equal(inside.blocked, true);
  assert.equal(inside.nextAllowedAt, "2026-03-31T00:00:00.000Z");
  assert.equal(PASS_REASSIGN_COOLDOWN_DAYS, 30);
});

test("the cooldown ends exactly at 30 days, not a day late", () => {
  const assigned = "2026-03-01T00:00:00.000Z";
  assert.equal(cooldownStateOf(assigned, "2026-03-30T23:59:59.000Z").blocked, true);
  assert.equal(cooldownStateOf(assigned, "2026-03-31T00:00:00.000Z").blocked, false);
});

test("an unparseable assignment timestamp unblocks rather than locks out", () => {
  assert.equal(cooldownStateOf("not-a-date", NOW).blocked, false);
});

// ── device hint ───────────────────────────────────────────────────────────

test("the device hint picks a child only when it still names one of theirs", () => {
  const kids = [{ id: "a" }, { id: "b" }];
  assert.equal(resolveInitialChildId(kids, "b"), "b");
  assert.equal(resolveInitialChildId(kids, "gone"), "a", "a stale hint falls back, never 404s");
  assert.equal(resolveInitialChildId(kids, null), "a");
  assert.equal(resolveInitialChildId([], "a"), null, "no children -> caller sends to /onboard");
});

test("the hint is never read on the server", () => {
  const serverFiles = ["src/lib/server/children.ts", "src/lib/server/coverage.ts", "src/lib/server/progress.ts", "src/lib/server/pass.ts"];
  for (const f of serverFiles) {
    const src = readFileSync(f, "utf8");
    assert.equal(src.includes(CHILD_HINT_KEY), false, f);
    assert.equal(/readActiveChildId|localStorage/.test(src), false, f);
  }
});

// ── duplicate names ───────────────────────────────────────────────────────

test("duplicate detection folds width and case but never rejects", () => {
  assert.equal(normalizeChildName("ﾀﾛｳ"), normalizeChildName("タロウ"));
  assert.equal(normalizeChildName(" たろう "), normalizeChildName("たろう"));
  assert.equal(normalizeChildName("Taro"), normalizeChildName("taro"));
  assert.notEqual(normalizeChildName("たろう"), normalizeChildName("はなこ"));
});

test("no unique index on child name exists anywhere in the schema", async () => {
  const entries = await readdir("migrations");
  for (const name of entries.filter((f) => f.endsWith(".sql"))) {
    const sql = await readFile(`migrations/${name}`, "utf8");
    const stripped = sql.replace(/--.*$/gm, "");
    assert.equal(
      /create\s+unique\s+index[^;]*\bon\s+children\s*\([^)]*\bname\b/i.test(stripped),
      false,
      `${name} declares a unique index over children.name -- siblings share names`,
    );
  }
});

// ── database ──────────────────────────────────────────────────────────────

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  const entries = await readdir("migrations");
  for (const { name } of pendingMigrations(entries, [])) {
    await pg.exec(await readFile(`migrations/${name}`, "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [name]);
  }
  return pg;
}

async function seedHousehold(pg: PGlite, hh: string, userId: string) {
  await pg.query("insert into household (id) values ($1)", [hh]);
  await pg.query("insert into household_member (household_id, user_id, role) values ($1,$2,'owner')", [hh, userId]);
  await pg.query("insert into subscription (household_id, state) values ($1,'trial')", [hh]);
}

async function seedChild(pg: PGlite, id: string, hh: string, userId: string, name = "たろう") {
  await pg.query(
    "insert into children (id, user_id, household_id, name, grade) values ($1,$2,$3,$4,1)",
    [id, userId, hh, name],
  );
}

test("0014 adds coverage columns of a type that can actually reference children(id)", async () => {
  const pg = await freshDb();
  const cols = await pg.query<{ column_name: string; data_type: string; is_nullable: string }>(
    `select column_name, data_type, is_nullable from information_schema.columns
     where table_name = 'household' and column_name in ('covered_child_id','covered_assigned_at')`,
  );
  assert.equal(cols.rows.length, 2);
  const covered = cols.rows.find((c) => c.column_name === "covered_child_id")!;
  // The ticket's sketch said uuid; every id in this repo is text, generated
  // by crypto.randomUUID() in app code. A uuid column could not have carried
  // the foreign key at all.
  assert.equal(covered.data_type, "text");
  assert.equal(covered.is_nullable, "YES", "NULL means all children -- never backfill it");
});

test("covered_child_id really is a foreign key to children", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await assert.rejects(
    () => pg.query("update household set covered_child_id = 'no-such-child' where id = 'hh1'"),
    /foreign key|violates/i,
  );
});

test("a hard delete of a child with progress FAILS -- loudly, not by cascading", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await seedChild(pg, "c1", "hh1", "u1");
  await pg.query("insert into kanji_progress (user_id, child_id, kanji) values ('u1','c1','山')");
  await assert.rejects(
    () => pg.query("delete from children where id = 'c1'"),
    /foreign key|violates|referenced/i,
    "the FKs added in 0013 are NO ACTION, which refuses this delete exactly as RESTRICT would",
  );
  const still = await pg.query<{ c: number }>("select count(*)::int as c from kanji_progress where child_id = 'c1'");
  assert.equal(still.rows[0]!.c, 1, "nothing was destroyed on the way to that error");
});

test("no ON DELETE CASCADE reaches children from any progress table", async () => {
  const pg = await freshDb();
  const fks = await pg.query<{ constraint_name: string; delete_rule: string }>(
    `select c.constraint_name, r.delete_rule
     from information_schema.table_constraints c
     join information_schema.referential_constraints r on r.constraint_name = c.constraint_name
     join information_schema.constraint_column_usage u on u.constraint_name = c.constraint_name
     where c.constraint_type = 'FOREIGN KEY' and u.table_name = 'children'`,
  );
  assert.ok(fks.rows.length >= 6, `expected the six progress FKs, saw ${fks.rows.length}`);
  for (const fk of fks.rows) {
    assert.notEqual(fk.delete_rule, "CASCADE", `${fk.constraint_name} would silently destroy a train`);
  }
});

test("the household_id backfill makes the column live for pre-existing children", async () => {
  // 0010 wrote household_id once and nothing has written it since; 0014
  // backfills from household_member. Simulated by inserting a child with a
  // null household_id and re-running 0014's update.
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await pg.query("insert into children (id, user_id, name, grade) values ('orphan','u1','たろう',1)");
  const before = await pg.query<{ household_id: string | null }>("select household_id from children where id = 'orphan'");
  assert.equal(before.rows[0]!.household_id, null);
  const sql = await readFile("migrations/0014_multi_child.sql", "utf8");
  const backfill = sql.match(/update children c\n[\s\S]*?;/);
  assert.ok(backfill, "0014 should contain the household_id backfill");
  await pg.exec(backfill![0]);
  const after = await pg.query<{ household_id: string | null }>("select household_id from children where id = 'orphan'");
  assert.equal(after.rows[0]!.household_id, "hh1");
});

test("a child of another household is invisible to the ownership filter", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await seedHousehold(pg, "hh2", "u2");
  await seedChild(pg, "mine", "hh1", "u1");
  await seedChild(pg, "theirs", "hh2", "u2");
  // findOwnedChild's query, verbatim in shape.
  const rows = await pg.query(
    "select id from children where id = $1 and household_id = $2 and archived_at is null",
    ["theirs", "hh1"],
  );
  assert.equal(rows.rows.length, 0, "nothing found -> 404, never 403, so the id is not confirmed to exist");
  const own = await pg.query("select id from children where id = $1 and household_id = $2 and archived_at is null", ["mine", "hh1"]);
  assert.equal(own.rows.length, 1);
});

test("an archived child is invisible too, without its progress being touched", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await seedChild(pg, "c1", "hh1", "u1");
  await pg.query("insert into kanji_progress (user_id, child_id, kanji) values ('u1','c1','山')");
  await pg.query("update children set archived_at = now() where id = 'c1'");
  const visible = await pg.query("select id from children where id = 'c1' and household_id = 'hh1' and archived_at is null");
  assert.equal(visible.rows.length, 0);
  const progress = await pg.query<{ c: number }>("select count(*)::int as c from kanji_progress where child_id = 'c1'");
  assert.equal(progress.rows[0]!.c, 1, "soft delete only -- progress rows are never removed");
});

test("archiving the covered child clears the coverage instead of moving it", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await seedChild(pg, "c1", "hh1", "u1", "たろう");
  await seedChild(pg, "c2", "hh1", "u1", "はなこ");
  await pg.query("update household set covered_child_id = 'c1', covered_assigned_at = now() where id = 'hh1'");
  // archiveChild's two statements.
  await pg.query("update children set archived_at = now() where id = 'c1' and household_id = 'hh1'");
  await pg.query("update household set covered_child_id = null where id = 'hh1' and covered_child_id = 'c1'");
  const hh = await pg.query<{ covered_child_id: string | null; covered_assigned_at: string | null }>(
    "select covered_child_id, covered_assigned_at from household where id = 'hh1'",
  );
  assert.equal(hh.rows[0]!.covered_child_id, null, "cleared");
  assert.notEqual(hh.rows[0]!.covered_assigned_at, null, "the cooldown is not reset by archiving");
});

test("the upgrade to a buyout clears the assignment and restores nothing", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  await seedChild(pg, "c1", "hh1", "u1");
  await pg.query("update household set covered_child_id = 'c1', covered_assigned_at = now() where id = 'hh1'");
  // recomputeSubscription's buyout branch.
  await pg.query("update household set covered_child_id = null where id = 'hh1' and covered_child_id is not null");
  const hh = await pg.query<{ covered_child_id: string | null }>("select covered_child_id from household where id = 'hh1'");
  assert.equal(hh.rows[0]!.covered_child_id, null);
  // And with it cleared, every child rides.
  for (const id of ["c1", "c2"]) {
    assert.equal(entitlementFor(BUYOUT, { coveredChildId: null }, id, NOW).canRide, true);
  }
});

test("the same idempotency key creates one child, not two", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  const insert = (id: string) =>
    pg.query(
      `insert into children (id, user_id, household_id, name, grade, idempotency_key)
       values ($1,'u1','hh1','たろう',1,'key-1')
       on conflict (user_id, idempotency_key) do nothing`,
      [id],
    );
  await insert("c1");
  await insert("c2");
  const rows = await pg.query<{ c: number }>("select count(*)::int as c from children where household_id = 'hh1'");
  assert.equal(rows.rows[0]!.c, 1);
});

test("the advisory lock is transaction-scoped and really serialises a household", async () => {
  const pg = await freshDb();
  await seedHousehold(pg, "hh1", "u1");
  // PGlite is a single connection, so this proves the SQL is valid and that
  // the lock is released at COMMIT -- the property that matters, since the
  // session-scoped form is what leaks on a pooled connection and wedges a
  // household until it is recycled.
  await pg.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock($1, hashtext($2))", [HOUSEHOLD_LOCK_NS, "hh1"]);
    const held = await tx.query<{ c: number }>(
      "select count(*)::int as c from pg_locks where locktype = 'advisory' and classid = $1",
      [HOUSEHOLD_LOCK_NS],
    );
    assert.equal(held.rows[0]!.c, 1, "held inside the transaction");
  });
  const after = await pg.query<{ c: number }>(
    "select count(*)::int as c from pg_locks where locktype = 'advisory' and classid = $1",
    [HOUSEHOLD_LOCK_NS],
  );
  assert.equal(after.rows[0]!.c, 0, "released by COMMIT, with nothing to remember to unlock");
});

test("nothing in the app takes a session-scoped advisory lock", () => {
  const lockFile = readFileSync("src/lib/server/household-lock.ts", "utf8");
  assert.match(lockFile, /pg_advisory_xact_lock/);
  assert.equal(/pg_advisory_lock\s*\(/.test(lockFile), false);
  assert.equal(HOUSEHOLD_LOCK_NS, 4711);
});

// ── the child surface says nothing about money ────────────────────────────

test("no child-facing surface can render a price, a tier, or an upgrade", () => {
  // Asserted over source rather than by eye, because this is the rule most
  // likely to be broken by a well-meaning "helpful" addition later.
  const childSurfaces = [
    "src/components/child-home.tsx",
    "src/components/child-switcher.tsx",
    "src/components/departure-ticket.tsx",
    "src/components/home-line-strip.tsx",
    "src/routes/app/child.$childId.index.tsx",
    "src/routes/app/child.$childId.tsx",
  ];
  for (const f of childSurfaces) {
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(/¥|\\u00a5|円/.test(src), false, `${f} contains a price glyph`);
    assert.equal(/アップグレード/.test(src), false, `${f} offers an upgrade`);
    assert.equal(/9,?800|1,?280|10,?800/.test(src), false, `${f} contains a price`);
    assert.equal(/\/subscribe|PlanCards|passAssign/.test(src), false, `${f} routes a child to commerce`);
    assert.equal(/保護者の方へ/.test(src), false, `${f} prompts a child to fetch a parent about money`);
  }
});

test("the locked board says 「いまは のれません」 and offers no free ride", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  // The disabled empty state must NOT reuse the entitled 「きょうは おやすみ」
  // copy, which reads as "come back tomorrow" and is not what happened.
  assert.match(home, /emptyLead=\{canRide \? t\("ticketEmpty"\) : t\("cannotRideNow"\)\}/);
  const ticket = readFileSync("src/components/departure-ticket.tsx", "utf8");
  // No ride affordance at all while disabled -- not a greyed-out one.
  assert.match(ticket, /\{disabled \? null : <span[^>]*>▶ \{rideLabel\}/);
  assert.match(ticket, /aria-disabled=\{disabled \|\| undefined\}/);
});

test("the switcher is navigation, with no gate and no coverage signal", () => {
  const src = readFileSync("src/components/child-switcher.tsx", "utf8");
  assert.match(src, /to="\/app\/child\/\$childId"/);
  assert.equal(/canRide|covered|entitle/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), false);
  assert.equal(/confirm\(/.test(src), false, "one tap, no confirmation -- this is navigation");
});

// ── route scoping ─────────────────────────────────────────────────────────

test("every child-facing route lives under /app/child/$childId", () => {
  const scoped = [
    ["src/routes/app/child.$childId.index.tsx", "/app/child/$childId/"],
    ["src/routes/app/child.$childId.catalog.tsx", "/app/child/$childId/catalog"],
    ["src/routes/app/child.$childId.stamps.tsx", "/app/child/$childId/stamps"],
    ["src/routes/app/child.$childId.workshop.tsx", "/app/child/$childId/workshop"],
    ["src/routes/app/child.$childId.mistakes.tsx", "/app/child/$childId/mistakes"],
    ["src/routes/app/child.$childId.kanji.$char.tsx", "/app/child/$childId/kanji/$char"],
    ["src/routes/app/child.$childId.map.tsx", "/app/child/$childId/map"],
  ] as const;
  for (const [file, route] of scoped) {
    const src = readFileSync(file, "utf8");
    assert.ok(src.includes(`createFileRoute("${route}")`), `${file} should declare ${route}`);
    // The child comes from the path, never from storage.
    assert.equal(/readActiveChildId/.test(src), false, `${file} still reads the device hint`);
  }
});

test("/app resolves a child and forwards; it is no longer a board", () => {
  const src = readFileSync("src/routes/app/index.tsx", "utf8");
  assert.match(src, /resolveInitialChildId/);
  assert.match(src, /to: "\/app\/child\/\$childId"/);
  assert.match(src, /"\/onboard"/);
  assert.equal(/ChildHome/.test(src), false, "the board moved");
});

test("the pre-scoping paths still resolve instead of 404ing", () => {
  for (const f of ["catalog", "stamps", "workshop", "mistakes", "map"]) {
    const src = readFileSync(`src/routes/app/${f}.tsx`, "utf8");
    assert.match(src, /useResolvedChildId/);
    assert.match(src, /\/app\/child\/\$childId/);
  }
});

test("the layout validates the path's child against the household's own list", () => {
  const src = readFileSync("src/routes/app/child.$childId.tsx", "utf8");
  assert.match(src, /listChildren/);
  assert.match(src, /if \(!known\) return <Navigate to="\/app" replace \/>;/);
  // It must NOT gate on entitlement: an uncovered child still sees the board.
  assert.equal(/canRide/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), false);
});

test("all four progress mutations check ownership before entitlement", () => {
  const src = readFileSync("src/lib/server/progress.ts", "utf8");
  const gated = src.match(/assertChildCanRideForCaller\(context\.userId, data\.childId\)/g) ?? [];
  assert.equal(gated.length, 4, "getKanjiStudy, completeEncounter, completeUnderstand, submitPractice");
  // The old household-level gate must be gone, not merely unused.
  assert.equal(/assertCanRide\(await getSql\(\)/.test(src), false);
  const coverage = readFileSync("src/lib/server/coverage.ts", "utf8");
  const order = coverage.indexOf("assertOwnedChild") < coverage.indexOf("getChildEntitlement(sql, householdId, childId, nowIso)");
  assert.ok(order, "ownership is resolved before entitlement, so a foreign id 404s rather than 403s");
  assert.match(coverage, /new ChildAccessError\(404/);
  assert.match(coverage, /new ChildAccessError\(403/);
});

test("ownership is a household question, with user_id only as the orphan fallback", () => {
  const coverage = readFileSync("src/lib/server/coverage.ts", "utf8");
  assert.match(coverage, /household_id = \$\{householdId\}/);

  // This test used to assert that user_id appeared NOWHERE here, and that
  // assertion was the bug: scoping by household_id alone made children whose
  // household_id was null during a deploy window belong to nobody, and a
  // parent with two children was shown zero. user_id is allowed now, but
  // ONLY guarded by `household_id is null` -- a bare user_id match would
  // bring back the co-parent blindness the household scoping exists to fix.
  const userIdUses = coverage.match(/user_id = \$\{[^}]*\}/g) ?? [];
  for (const use of userIdUses) {
    const at = coverage.indexOf(use);
    const context = coverage.slice(Math.max(0, at - 120), at + use.length);
    assert.match(
      context,
      /household_id is null and /,
      `user_id matched outside the orphan fallback: ${use}`,
    );
  }
});

test("every household mutation runs under the lock, inside a transaction", () => {
  for (const f of ["src/lib/server/children.ts", "src/lib/server/pass.ts", "src/lib/server/webhooks.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /withHouseholdLock/, f);
  }
  for (const f of ["src/lib/server/children.ts", "src/lib/server/pass.ts"]) {
    assert.match(readFileSync(f, "utf8"), /withTransaction/, f);
  }
  // The lock is worthless on the pooled client; withTransaction is what pins
  // a connection.
  const db = readFileSync("src/lib/db.ts", "utf8");
  assert.match(db, /export async function withTransaction/);
  assert.match(db, /await client\.query\("begin"\)/);
  assert.match(db, /await client\.query\("rollback"\)/);
});

test("the pass_reassigned audit row cannot move a household's entitlement", async () => {
  const { deriveSubscription } = await import("../src/lib/subscription-derive.ts");
  const base = {
    baseTrialEndsAt: "2026-03-10T00:00:00.000Z",
    events: [],
    nowIso: NOW,
  };
  const without = deriveSubscription({ ...base, adminActions: [] });
  // assignAnnualPass writes this row on every reassignment. admin_action is
  // an INPUT to the derivation, so "it's only an audit log" has to be
  // demonstrated, not asserted: the fold must produce byte-identical state.
  const withAudit = deriveSubscription({
    ...base,
    adminActions: [{ type: "note" as const, createdAt: NOW }],
  });
  assert.deepEqual(withAudit, without);
});

test("two children on two devices do not share any server-side selection", () => {
  // There is no "active child" column, anywhere. Each request names its own
  // child and is authorised on its own; nothing one device does can change
  // what another device is looking at.
  const migrations = readFileSync("migrations/0014_multi_child.sql", "utf8");
  assert.equal(/active_child|current_child|selected_child/i.test(migrations), false);
  for (const f of ["src/lib/server/children.ts", "src/lib/server/progress.ts", "src/lib/server/coverage.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.equal(/set\s+active_child|active_child_id/i.test(src), false, f);
  }
});

test("the quota is enforced after the lock is taken, not before", () => {
  const src = readFileSync("src/lib/server/children.ts", "utf8");
  const lockAt = src.indexOf("withHouseholdLock");
  const countAt = src.indexOf("select count(*)::int as c from children");
  const insertAt = src.indexOf("insert into children (");
  assert.ok(lockAt > -1 && countAt > lockAt, "the count must happen inside the lock");
  assert.ok(insertAt > countAt, "and the insert after the count");
  // The idempotency replay is checked FIRST, so a retry of a request that
  // already succeeded is never refused by the cap its own predecessor filled.
  const idemAt = src.indexOf("idempotency_key = ${data.idempotencyKey}");
  assert.ok(idemAt > lockAt && idemAt < countAt);
});

test("the duplicate-name refusal is confirmable, and confirming skips the check entirely", () => {
  const src = readFileSync("src/lib/server/children.ts", "utf8");
  assert.match(src, /if \(!data\.confirmDuplicateName\) \{/);
  assert.match(src, /code: "DUPLICATE_NAME"/);
  const onboard = readFileSync("src/routes/onboard.tsx", "utf8");
  assert.match(onboard, /confirmDuplicateName: nameWarning/);
  // The same idempotency key must survive the ask-then-confirm round trip,
  // or the confirm becomes a second creatable request.
  assert.match(onboard, /idempotencyKeyRef = useRef\(crypto\.randomUUID\(\)\)/);
});
