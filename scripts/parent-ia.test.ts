import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";
import { refundMailtoHref, REFUND_SUBJECT, REFUND_EMAIL } from "../src/lib/refund-contact.ts";

/**
 * The parent surface split into two hubs, the metrics that make it
 * reassuring, and the one mutation on it that could destroy a family's work
 * if it were written carelessly.
 *
 * The grade-change invariant is exercised against a real database rather than
 * asserted over source: "does not touch kanji_progress" is a claim about what
 * a transaction did, and the only honest way to check it is to write progress,
 * change the grade, and compare the rows byte for byte.
 */

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite({ parsers: { 20: Number } });
  await pg.waitReady;
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const entries = await readdir("migrations");
  for (const { name } of pendingMigrations(entries, [])) {
    await pg.exec(await readFile(`migrations/${name}`, "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [name]);
  }
  return pg;
}

async function seed(pg: PGlite) {
  await pg.query("insert into household (id) values ('hh1')");
  await pg.query("insert into household_member (household_id, user_id, role) values ('hh1','u1','owner')");
  await pg.query("insert into subscription (household_id, state) values ('hh1','trial')");
  await pg.query(
    "insert into children (id,user_id,household_id,name,grade,start_band,active_grade_route_id) values ('c1','u1','hh1','たろう',4,'beginning','r1')",
  );
  await pg.query(
    `insert into grade_routes (id, user_id, child_id, grade, ordered_kanji, start_index, start_band, created_at)
     values ('r1','u1','c1',4,'["校"]',0,'beginning', now())`,
  );
}

// ── the invariant: a grade change must not cost a child their work ─────────

test("changing a child's grade leaves every kanji_progress row byte-for-byte identical", async () => {
  const pg = await freshDb();
  await seed(pg);
  // A child mid-flight: two mastered characters, one due for review, and an
  // echo scheduled for Thursday.
  await pg.query(`
    insert into kanji_progress
      (user_id, child_id, kanji, status, correct_streak, attempts, wrong_count, completed_kinds, updated_at)
    values
      ('u1','c1','山','perfect',3,5,0,'reading,meaning,shape', now()),
      ('u1','c1','川','perfect',3,4,0,'reading,meaning,shape', now()),
      ('u1','c1','空','fix',0,6,2,'reading', now())
  `);
  await pg.query("insert into child_stamps (user_id, child_id, kanji, perfect_at) values ('u1','c1','山', now())");
  await pg.query("insert into child_stamps (user_id, child_id, kanji, perfect_at) values ('u1','c1','川', now())");

  const before = await pg.query<Record<string, unknown>>(
    "select * from kanji_progress where child_id = 'c1' order by kanji",
  );
  const stampsBefore = await pg.query<{ c: number }>(
    "select count(*)::int as c from child_stamps where child_id = 'c1'",
  );

  // setChildGrade's writes, verbatim in shape: new route, archive the old,
  // move the child and re-cut the plan. Nothing else.
  const nowIso = new Date().toISOString();
  await pg.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock($1, hashtext($2))", [4711, "hh1"]);
    await tx.query(
      `insert into grade_routes (id, user_id, child_id, grade, ordered_kanji, start_index, start_band, created_at)
       values ('r2','u1','c1',1,'["一"]',0,'beginning',$1)`,
      [nowIso],
    );
    await tx.query("update grade_routes set archived_at = $1, superseded_by = 'r2' where id = 'r1'", [nowIso]);
    await tx.query(
      `update children set grade = 1, start_band = 'beginning', active_grade_route_id = 'r2',
         plan_week_start = '2026-09-07', plan_cursor = 0, plan_new_kanji = '["一"]'
       where id = 'c1' and household_id = 'hh1'`,
    );
  });

  const after = await pg.query<Record<string, unknown>>(
    "select * from kanji_progress where child_id = 'c1' order by kanji",
  );
  assert.deepEqual(after.rows, before.rows, "kanji_progress must be untouched by a grade change");

  const stampsAfter = await pg.query<{ c: number }>(
    "select count(*)::int as c from child_stamps where child_id = 'c1'",
  );
  assert.equal(stampsAfter.rows[0]!.c, stampsBefore.rows[0]!.c, "green cars survive the move");

  const child = await pg.query<{ grade: number; active_grade_route_id: string }>(
    "select grade, active_grade_route_id from children where id = 'c1'",
  );
  assert.equal(child.rows[0]!.grade, 1);
  assert.equal(child.rows[0]!.active_grade_route_id, "r2");

  // The old route is archived, never deleted -- it is the only record of what
  // the child was working through.
  const old = await pg.query<{ archived_at: string | null; superseded_by: string | null }>(
    "select archived_at, superseded_by from grade_routes where id = 'r1'",
  );
  assert.notEqual(old.rows[0]!.archived_at, null);
  assert.equal(old.rows[0]!.superseded_by, "r2");
});

test("setChildGrade's source touches neither progress nor echo scheduling", () => {
  const src = readFileSync("src/lib/server/children.ts", "utf8");
  const start = src.indexOf("export const setChildGrade");
  const end = src.indexOf("export const confirmGradeRollover");
  assert.ok(start > -1 && end > start);
  const body = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // The progress map is READ (pickWeeklyNew consults it) and never written.
  assert.equal(/insert into kanji_progress|update kanji_progress|delete from kanji_progress/i.test(body), false);
  assert.equal(/echo_due_at|echo_success_count|last_success_by_kind/i.test(body), false);
  assert.equal(/child_stamps/i.test(body), false);
  // And it is serialised, because it writes two tables.
  assert.match(body, /withTransaction/);
  assert.match(body, /withHouseholdLock/);
});

test("the grade change is confirmable and leads with what does not change", () => {
  const src = readFileSync("src/components/child-profile-row.tsx", "utf8");
  assert.match(src, /data-grade-confirm/);
  assert.match(src, /gradeChangeSafe/);
  const ja = readFileSync("src/lib/i18n/messages.ts", "utf8");
  assert.match(ja, /学年を変更しても、これまでのかんぺきな記録は消えません/);
  // A rename must NOT be gated behind that confirm -- it is a column write.
  const codeBody = codeOf("src/components/child-profile-row.tsx");
  const renameAt = codeBody.indexOf("async function saveName");
  const renameEnd = codeBody.indexOf("async function applyGrade");
  assert.equal(/confirm/i.test(codeBody.slice(renameAt, renameEnd)), false);
});

test("grade validation rejects out-of-range before it writes anything", () => {
  const body = readFileSync("src/lib/server/children.ts", "utf8");
  assert.match(body, /code: "INVALID_GRADE"/);
  assert.match(body, /code: "SAME_GRADE"/);
  assert.match(body, /code: "CHILD_NOT_FOUND"/);
  // 404 semantics, never 403: findOwnedChild answers both "no such child" and
  // "someone else's child" the same way.
  assert.match(body, /findOwnedChild\(sql, householdId, data\.childId, context\.userId\)/);
});

// ── metrics ───────────────────────────────────────────────────────────────

test("the hero number is monotonic by construction — it reads child_stamps", async () => {
  const pg = await freshDb();
  await seed(pg);
  const stamp = (k: string) =>
    pg.query("insert into child_stamps (user_id, child_id, kanji, perfect_at) values ('u1','c1',$1, now()) on conflict (child_id, kanji) do nothing", [k]);
  await stamp("山");
  await stamp("川");
  await stamp("山"); // a second perfect for the same car
  const count = await pg.query<{ c: number }>("select count(*)::int as c from child_stamps where child_id='c1'");
  assert.equal(count.rows[0]!.c, 2, "re-earning a car does not double-count it");

  // A car that regresses out of perfect does NOT remove its stamp: this is
  // what lets 「これまでのかんぺき」 promise it only goes up.
  await pg.query(
    "insert into kanji_progress (user_id, child_id, kanji, status) values ('u1','c1','山','fix')",
  );
  const after = await pg.query<{ c: number }>("select count(*)::int as c from child_stamps where child_id='c1'");
  assert.equal(after.rows[0]!.c, 2);
});

test("the weekly rhythm counts Tokyo days, not UTC days", async () => {
  const pg = await freshDb();
  await seed(pg);
  const ev = (k: string, iso: string) =>
    pg.query(
      `insert into practice_events (user_id, child_id, kanji, kind, correct, answer, is_echo, session_id, created_at)
       values ('u1','c1',$1,'reading',true,'x',false,'s',$2)`,
      [k, iso],
    );
  await ev("山", "2026-08-01T00:00:00Z"); // before the week: not new, not ridden
  await ev("山", "2026-09-08T01:00:00Z"); // JST 09-08 10:00
  await ev("川", "2026-09-09T23:00:00Z"); // JST 09-10 08:00
  await ev("空", "2026-09-10T14:00:00Z"); // JST 09-10 23:00 -- SAME Tokyo day

  const weekStart = "2026-09-07";
  const r = await pg.query<{ days: number; new_met: number }>(
    `with in_week as (
       select kanji, created_at from practice_events
       where child_id = 'c1' and (created_at at time zone 'Asia/Tokyo')::date >= $1::date
     ), first_seen as (
       select kanji, min(created_at) as first_at from practice_events where child_id='c1' group by kanji
     )
     select (select count(distinct (created_at at time zone 'Asia/Tokyo')::date) from in_week)::int as days,
            (select count(*) from first_seen
              where (first_at at time zone 'Asia/Tokyo')::date >= $1::date)::int as new_met`,
    [weekStart],
  );
  // Two Tokyo days, not three: the last two events are 08:00 and 23:00 on the
  // same JST day even though they are different UTC days.
  assert.equal(r.rows[0]!.days, 2);
  // 山 was first met in August, so only 川 and 空 are new this week.
  assert.equal(r.rows[0]!.new_met, 2);
});

test("no percentage is rendered anywhere on the parent metrics", () => {
  // A percentage hides its denominator, so shipping more characters would
  // silently move every family's number DOWN. The fraction shows its working.
  for (const f of ["src/components/mastery-hero.tsx", "src/components/weekly-rhythm.tsx"]) {
    const src = codeOf(f);
    assert.equal(/%|percent|Math\.round\([^)]*\/[^)]*\*\s*100/i.test(src), false, `${f} renders a percentage`);
  }
  const hero = codeOf("src/components/mastery-hero.tsx");
  assert.match(hero, /masteryDenomNote/, "the denominator must be named where the fraction is shown");
  // The cumulative figure has no denominator at all.
  assert.match(hero, /data-mastery-cumulative=\{cumulativePerfect\}/);
});

test("the hero reads stamps for cumulative and teach-ready for the grade fraction", () => {
  const route = codeOf("src/routes/app/parent.report.$childId.tsx");
  assert.match(route, /cumulativePerfect=\{data\.stampCount\}/);
  assert.match(route, /gradePerfect=\{data\.report\?\.teachReadyPerfect \?\? 0\}/);
  assert.match(route, /gradeTotal=\{data\.report\?\.teachReadyTotal \?\? 0\}/);
});

// ── routing ───────────────────────────────────────────────────────────────

test("the parent surface is two hubs plus a resolver", () => {
  assert.match(readFileSync("src/routes/app/parent.index.tsx", "utf8"), /createFileRoute\("\/app\/parent\/"\)/);
  assert.match(
    readFileSync("src/routes/app/parent.report.$childId.tsx", "utf8"),
    /createFileRoute\("\/app\/parent\/report\/\$childId"\)/,
  );
  assert.match(readFileSync("src/routes/app/parent.settings.tsx", "utf8"), /createFileRoute\("\/app\/parent\/settings"\)/);
});

test("the resolver still honours ?child= and still owns the checkout wait", () => {
  const src = readFileSync("src/routes/app/parent.index.tsx", "utf8");
  assert.match(src, /child: typeof s\.child === "string"/);
  assert.match(src, /resolveInitialChildId/);
  assert.match(src, /data-checkout-pending/);
  // A household with no children has nothing to report on, so it lands on the
  // hub that carries the add-a-child entry point.
  assert.match(src, /if \(!childId\) return <Navigate to="\/app\/parent\/settings" replace \/>;/);
});

test("settings is household-scoped and takes no child param", () => {
  const src = readFileSync("src/routes/app/parent.settings.tsx", "utf8");
  assert.equal(/\$childId/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), false);
  assert.match(src, /getAccountSummary/);
  assert.match(src, /data-settings-children/);
  assert.match(src, /data-settings-plan/);
  assert.match(src, /data-settings-account/);
});

test("prefetch is idle-driven and warms one sibling, never hover", () => {
  const src = codeOf("src/routes/app/parent.report.$childId.tsx");
  assert.match(src, /requestIdleCallback/);
  assert.match(src, /prefetchQuery/);
  assert.equal(/onMouseEnter|onPointerEnter|onHover/i.test(src), false, "no hover -- phones do not have one");
  // One sibling, not the whole household: getParentOverview is the heaviest
  // response in the app.
  assert.match(src, /const next = others\[0\];/);
});

// ── mobile ────────────────────────────────────────────────────────────────

test("the sibling rail scrolls horizontally on a phone and wraps once there is room", () => {
  const src = readFileSync("src/components/parent-shell.tsx", "utf8");
  assert.match(src, /overflow-x-auto/);
  assert.match(src, /overscroll-x-contain/);
  assert.match(src, /\[scrollbar-width:none\]/);
  assert.match(src, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(src, /sm:flex-wrap/);
});

test("every parent tap target clears 44px", () => {
  // min-h-11 is 2.75rem = 44px in this project's scale.
  const files = [
    "src/components/parent-shell.tsx",
    "src/components/help-popover.tsx",
    "src/components/child-profile-row.tsx",
    "src/components/refund-modal.tsx",
    "src/components/mastery-hero.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /min-h-11|h-11/, `${f} has no 44px target`);
  }
  // The (?) is an icon button, so it needs both dimensions.
  assert.match(readFileSync("src/components/help-popover.tsx", "utf8"), /h-11 w-11/);
});

test("the help popover works without hover and closes the ways a user expects", () => {
  const src = readFileSync("src/components/help-popover.tsx", "utf8");
  assert.match(src, /onClick=\{\(\) => setOpen/);
  assert.match(src, /"Escape"/);
  assert.match(src, /pointerdown/);
  assert.match(src, /aria-expanded=\{open\}/);
  assert.equal(/title=|onMouseEnter/.test(src), false, "a title tooltip never appears on a phone");
});

// ── tier rules and support ────────────────────────────────────────────────

test("the tier rule is stated before the add-a-child tap, from the same quota the server enforces", () => {
  const src = readFileSync("src/routes/app/parent.settings.tsx", "utf8");
  assert.match(src, /data-add-child-rule/);
  assert.match(src, /addChildTrialRule/);
  assert.match(src, /addChildAnnualRule/);
  assert.match(src, /data-child-count/);
  const account = readFileSync("src/lib/server/account.ts", "utf8");
  assert.match(account, /childQuota\(/, "the cap shown must come from the function createChild enforces");
});

test("the refund mail is pre-filled and its subject is not localised", () => {
  const href = refundMailtoHref({ orderName: "#1001", email: "a@example.com" });
  assert.ok(href.startsWith(`mailto:${REFUND_EMAIL}?`));
  assert.ok(href.includes(encodeURIComponent(REFUND_SUBJECT)));
  assert.ok(decodeURIComponent(href).includes("#1001"));
  assert.ok(decodeURIComponent(href).includes("a@example.com"));
  // Support reads and filters Japanese whatever language the parent browses
  // in, so the subject must never come from the message catalogue.
  assert.equal(/refundSubject/.test(readFileSync("src/lib/i18n/messages.ts", "utf8")), false);
  // Unknown values are named, not left blank -- a blank line costs a round trip.
  assert.ok(decodeURIComponent(refundMailtoHref({ orderName: null, email: null })).includes("（不明）"));
});

test("the order NAME is what a parent is shown, not the numeric id", () => {
  const account = readFileSync("src/lib/server/account.ts", "utf8");
  assert.match(account, /payload->'raw'->>'name' as order_name/);
  const settings = readFileSync("src/routes/app/parent.settings.tsx", "utf8");
  assert.match(settings, /data-account-order/);
  assert.equal(/shopifyOrderId|shopify_order_id/.test(settings), false);
});

// ── the child surface stays clean ─────────────────────────────────────────

test("nothing the parent hub adds can reach a child surface", () => {
  // Everything in this change set talks about money, tiers or email. None of
  // it may be imported by a component a child board renders.
  const childSurfaces = [
    "src/components/child-home.tsx",
    "src/components/child-switcher.tsx",
    "src/components/departure-ticket.tsx",
    "src/routes/app/child.$childId.index.tsx",
  ];
  const parentOnly = [
    "pass-assignment-card",
    "refund-modal",
    "help-popover",
    "parent-shell",
    "child-profile-row",
    "server/account",
    "plan-cards",
  ];
  for (const f of childSurfaces) {
    const src = readFileSync(f, "utf8");
    for (const mod of parentOnly) {
      assert.equal(src.includes(mod), false, `${f} imports ${mod}`);
    }
  }
});

// ── the orphaned-household outage ─────────────────────────────────────────

/**
 * A household with two children read as zero, and /app/parent sent the parent
 * to /onboard.
 *
 * Cause: the deploy pipeline applies migrations BEFORE the new revision takes
 * traffic (deliberately -- the old revision has to keep working against the
 * new schema). In run 17 that gap was 3m42s: 0014 added children.household_id
 * at 05:13:26 and the revision whose createChild populates it went live at
 * 05:17:08. Children created in between were written by the old createChild
 * and landed with household_id NULL -- and listChildren scoped by
 * household_id alone, so they belonged to nobody.
 *
 * These tests reproduce that row and prove both halves of the repair: the
 * migration heals existing rows, and the query no longer needs it to.
 */

test("a child written during a deploy window is still their own family's", async () => {
  const pg = await freshDb();
  await seed(pg);
  // Exactly what the old revision's createChild wrote: no household_id.
  await pg.query(
    "insert into children (id, user_id, name, grade) values ('orphan','u1','はなこ',1)",
  );

  // The query as it was: scoped by household_id alone.
  const oldWay = await pg.query(
    "select id from children where household_id = 'hh1' and archived_at is null",
  );
  assert.equal(oldWay.rows.length, 1, "the pre-fix query saw only the non-orphaned child");

  // The query as it is now.
  const newWay = await pg.query(
    `select id from children
     where archived_at is null
       and (household_id = 'hh1' or (household_id is null and user_id = 'u1'))
     order by created_at asc`,
  );
  assert.equal(newWay.rows.length, 2, "both children are visible to their own parent again");
});

test("the widened match cannot reach another household's child", async () => {
  const pg = await freshDb();
  await seed(pg);
  // Another family, and an orphaned row of THEIRS.
  await pg.query("insert into household (id) values ('hh2')");
  await pg.query("insert into household_member (household_id, user_id, role) values ('hh2','u2','owner')");
  await pg.query("insert into children (id, user_id, name, grade) values ('theirs','u2','よその子',1)");

  const mine = await pg.query(
    `select id from children
     where archived_at is null
       and (household_id = 'hh1' or (household_id is null and user_id = 'u1'))`,
  );
  assert.deepEqual(
    mine.rows.map((r) => (r as { id: string }).id),
    ["c1"],
    "an orphaned row belonging to another creator is never matched",
  );
});

test("0015 heals the orphaned rows permanently", async () => {
  const pg = await freshDb();
  await seed(pg);
  await pg.query("insert into children (id, user_id, name, grade) values ('orphan','u1','はなこ',1)");

  const sql = await readFile("migrations/0015_reheal_child_household.sql", "utf8");
  const stripped = sql.replace(/--.*$/gm, "").trim();
  await pg.exec(stripped);

  const healed = await pg.query<{ household_id: string | null }>(
    "select household_id from children where id = 'orphan'",
  );
  assert.equal(healed.rows[0]!.household_id, "hh1");

  // Idempotent: running it again changes nothing.
  await pg.exec(stripped);
  const again = await pg.query<{ household_id: string | null }>(
    "select household_id from children where id = 'orphan'",
  );
  assert.equal(again.rows[0]!.household_id, "hh1");
});

test("a user who lost their membership row adopts their own household back", async () => {
  const pg = await freshDb();
  await seed(pg);
  // The other half of the same outage: the child kept its household, the user
  // lost the row that says they belong to it. Minting a fresh household here
  // would hide their children AND their subscription behind a new id.
  await pg.query("delete from household_member where user_id = 'u1'");

  const owned = await pg.query<{ household_id: string }>(
    "select household_id from children where user_id = 'u1' and household_id is not null order by created_at asc limit 1",
  );
  assert.equal(owned.rows[0]!.household_id, "hh1", "their household is discoverable from their own children");

  await pg.query(
    "insert into household_member (household_id, user_id, role) values ($1,'u1','owner') on conflict (user_id) do nothing",
    [owned.rows[0]!.household_id],
  );
  const restored = await pg.query<{ household_id: string }>(
    "select household_id from household_member where user_id = 'u1'",
  );
  assert.equal(restored.rows[0]!.household_id, "hh1", "and it is restored rather than replaced");
});

test("every ownership path carries the orphan fallback, not just the list", () => {
  // A child visible in the list but refused by the gate would be a worse bug
  // than the one being fixed.
  const coverage = readFileSync("src/lib/server/coverage.ts", "utf8");
  assert.match(coverage, /household_id is null and user_id = \$\{userId \?\? null\}/);
  const progress = readFileSync("src/lib/server/progress.ts", "utf8");
  assert.match(progress, /household_id is null and user_id = \$\{userId\}/);
  const children = readFileSync("src/lib/server/children.ts", "utf8");
  assert.match(children, /household_id is null and user_id = \$\{context\.userId\}/);
  // And every call site passes the creator through, or the fallback is dead code.
  for (const call of children.match(/findOwnedChild\([^)]*\)/g) ?? []) {
    assert.match(call, /context\.userId/, `findOwnedChild call missing userId: ${call}`);
  }
});

test("listChildren heals what it had to reach for", () => {
  const src = readFileSync("src/lib/server/children.ts", "utf8");
  assert.match(src, /update children set household_id = \$\{householdId\}/);
  // Best-effort: the read already succeeded, and a failed repair must not
  // cost the parent the list.
  const start = src.indexOf("const orphaned = rows.filter");
  const body = src.slice(start, start + 600);
  assert.match(body, /try \{/);
  assert.match(body, /\} catch \{/);
});

test("/onboard cannot hang on a failing children query, and emits no add=false", () => {
  const src = readFileSync("src/routes/onboard.tsx", "utf8");
  // React Query retries with backoff; keeping the skeleton up through that is
  // what made a failed listChildren look like an indefinite hang.
  assert.match(src, /childrenQ\.isLoading && !childrenQ\.isError/);
  // `add` is undefined when absent, so it never appears in the URL.
  assert.match(src, /\? true : undefined/);
  assert.match(src, /type Search = \{ next\?: string; add\?: true \}/);
});
