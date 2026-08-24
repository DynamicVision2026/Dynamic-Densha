import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GRADE_PARAMS } from "../src/lib/grade-params.ts";
import {
  makeGradeRoute,
  orderedKanjiForGrade,
  startIndexFor,
} from "../src/lib/grade-route.ts";
import { emptyProgress, evaluateProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import { isInspectionDue, markInspectionPass } from "../src/lib/inspection.ts";
import {
  pickWeeklyNew,
  rollPlanState,
  tokyoWeekStart,
  weeksElapsed,
} from "../src/lib/weekly-plan.ts";
import { buildDepartureBoard } from "../src/lib/departure-board.ts";
import { buildForwardMetrics } from "../src/lib/parent-forward.ts";
import { buildWeeklyPlan } from "../src/lib/weekly-plan.ts";

const G1 = orderedKanjiForGrade(1);

test("P0 G1 start band cuts are 0 / ~⅓ / ~⅔ of 80", () => {
  assert.equal(G1.length, 80);
  assert.equal(startIndexFor("beginning", 80), 0);
  assert.equal(startIndexFor("middle", 80), 26);
  assert.equal(startIndexFor("end", 80), 53);
  assert.equal(G1[0], "一");
});

test("P0 はじめ first week is early stations; なか is not forced to 一", () => {
  const empty = new Map<string, ProgressState>();
  const begin = pickWeeklyNew(G1, 0, 5, empty);
  assert.deepEqual(begin, G1.slice(0, 5));
  assert.ok(begin.includes("一"));
  const mid = pickWeeklyNew(G1, startIndexFor("middle", 80), 5, empty);
  assert.equal(mid.includes("一"), false);
  assert.ok(mid.length <= 5);
});

test("P0 already-blue cars are skipped in the first package, not dumped", () => {
  const progress = new Map<string, ProgressState>([
    ["一", { ...emptyProgress("一"), status: "perfect" }],
    ["右", { ...emptyProgress("右"), status: "almost" }],
  ]);
  const pack = pickWeeklyNew(G1, 0, 5, progress);
  assert.equal(pack.includes("一"), false);
  assert.equal(pack.includes("右"), false);
  assert.ok(pack.includes("円"));
  assert.equal(pack.length, 5);
});

test("P0 missed weeks advance the cursor instead of packing catch-up", () => {
  const route = makeGradeRoute({
    childId: "c",
    grade: 1,
    startBand: "beginning",
    nowIso: "2026-08-24T00:00:00.000Z",
  });
  const week0 = tokyoWeekStart("2026-08-24T01:00:00.000Z");
  const first = rollPlanState(
    { weekStart: week0, cursor: 0, newKanji: G1.slice(0, 5) },
    route,
    5,
    new Map(),
    "2026-09-14T01:00:00.000Z",
  );
  assert.ok(weeksElapsed(week0, first.weekStart) >= 3);
  assert.equal(first.cursor, 15);
  assert.equal(first.newKanji.length <= 5, true);
  assert.equal(first.newKanji.includes("一"), false);
});

test("P1 点検 is a flag: 60 days quiet after green, never demotes", () => {
  const now = "2026-08-24T00:00:00.000Z";
  const fresh = {
    ...emptyProgress("一"),
    status: "perfect" as const,
    perfectAt: "2026-08-20T00:00:00.000Z",
    lastPracticeAt: "2026-08-20T00:00:00.000Z",
  };
  assert.equal(isInspectionDue(fresh, undefined, now), false);
  const quiet = {
    ...fresh,
    perfectAt: "2026-06-01T00:00:00.000Z",
    lastPracticeAt: "2026-06-01T00:00:00.000Z",
  };
  assert.equal(isInspectionDue(quiet, undefined, now), true);
  const passed = markInspectionPass({}, "一", "2026-08-01T00:00:00.000Z");
  assert.equal(isInspectionDue(quiet, passed["一"], now), false);
  const later = isInspectionDue(quiet, passed["一"], "2027-02-01T00:00:00.000Z");
  assert.equal(later, true);
  const afterOpen = evaluateProgress(
    quiet,
    { type: "open", nowIso: now },
    getGradeParams(1),
  );
  assert.equal(afterOpen.status, "perfect");
});

test("P1 発車標 has this-week dates only and no behind copy in source", () => {
  const now = "2026-08-24T04:00:00.000Z";
  const progress: Record<string, ProgressState> = {
    右: {
      ...emptyProgress("右"),
      status: "almost",
      echoDueAt: "2026-08-24T00:00:00.000Z",
    },
    雨: {
      ...emptyProgress("雨"),
      status: "almost",
      echoDueAt: "2026-08-25T04:00:00.000Z",
    },
  };
  const route = makeGradeRoute({ childId: "c", grade: 1, startBand: "beginning", nowIso: now });
  const plan = buildWeeklyPlan({
    route,
    plan: { weekStart: tokyoWeekStart(now), cursor: 0, newKanji: ["円", "王"] },
    progress,
    nowIso: now,
  });
  const board = buildDepartureBoard({ progress, inspections: {}, plan, nowIso: now });
  assert.ok(board.today.some((c) => c.kanji === "右" && c.kind === "echo"));
  assert.ok(board.tomorrow.some((c) => c.kanji === "雨"));
  assert.deepEqual(board.newStations, ["円", "王"]);
  const src = [
    readFileSync(new URL("../src/lib/departure-board.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/components/departure-board.tsx", import.meta.url), "utf8"),
  ].join("\n");
  assert.equal(/遅れ|behind/i.test(src), false);
});

test("P0 parent forward has remaining + green, never evaluateProgress", () => {
  const now = "2026-08-24T00:00:00.000Z";
  const route = makeGradeRoute({ childId: "c", grade: 1, startBand: "beginning", nowIso: now });
  const progress = {
    一: { ...emptyProgress("一"), status: "perfect" as const },
  };
  const plan = buildWeeklyPlan({
    route,
    plan: { weekStart: tokyoWeekStart(now), cursor: 0, newKanji: ["円"] },
    progress,
    nowIso: now,
  });
  const forward = buildForwardMetrics({
    route,
    plan,
    progress,
    events: [{ kanji: "円", kind: "reading", correct: true, created_at: now, session_id: "s" }],
    inspections: {},
    nowIso: now,
  });
  assert.ok(forward.stationsRemaining > 0);
  assert.equal(forward.greenCount, 1);
  assert.equal(forward.rideDays28, 1);
  const src = readFileSync(new URL("../src/lib/parent-forward.ts", import.meta.url), "utf8");
  assert.equal(/\bevaluateProgress\s*\(/.test(src), false);
  const inspectSrc = readFileSync(new URL("../src/lib/inspection.ts", import.meta.url), "utf8");
  assert.equal(/\bevaluateProgress\s*\(/.test(inspectSrc), false);
});

test("R7 green decay stays off for every grade", () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    assert.equal(GRADE_PARAMS[g].perfect_decay_enabled, false);
  }
});

test("Day-one route snapshot keeps original startIndex after band-style cursor move", () => {
  const route = makeGradeRoute({
    childId: "c",
    grade: 1,
    startBand: "beginning",
    nowIso: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(route.startIndex, 0);
  const moved = rollPlanState(
    { weekStart: "2026-08-17", cursor: 0, newKanji: [] },
    { ...route, startIndex: 0 },
    5,
    new Map(),
    "2026-08-24T00:00:00.000Z",
  );
  assert.equal(route.startIndex, 0);
  assert.equal(moved.cursor, 5);
});
