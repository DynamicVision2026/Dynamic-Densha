import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GRADE_PARAMS } from "../src/lib/grade-params.ts";
import { makeGradeRoute, orderedKanjiForGrade } from "../src/lib/grade-route.ts";
import { emptyProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import {
  canAdvanceGrade,
  firstWeekOnNewRoute,
  nextGrade,
  planRollover,
  shouldShowAprilPrompt,
} from "../src/lib/grade-rollover.ts";
import { buildProjectedArrival } from "../src/lib/projected-arrival.ts";
import { pickWeeklyNew } from "../src/lib/weekly-plan.ts";

const G1 = orderedKanjiForGrade(1);
const G2 = orderedKanjiForGrade(2);

test("P2 rollover is explicit: no next grade without confirm, G6 has no G7", () => {
  assert.equal(nextGrade(1), 2);
  assert.equal(nextGrade(6), null);
  assert.equal(canAdvanceGrade(6), false);
  const g6 = makeGradeRoute({ childId: "c", grade: 6, startBand: "beginning" });
  const cap = planRollover({ current: g6, nowIso: "2026-08-24T00:00:00.000Z" });
  assert.equal(cap.ok, false);
});

test("P2 confirm archives snapshot and schedules the new grade only", () => {
  const current = makeGradeRoute({
    childId: "c",
    grade: 1,
    startBand: "middle",
    nowIso: "2026-03-01T00:00:00.000Z",
  });
  assert.equal(current.startIndex, 26);
  const progress = new Map<string, ProgressState>([
    ["円", { ...emptyProgress("円"), status: "fix" }],
    ["一", { ...emptyProgress("一"), status: "perfect" }],
  ]);
  const planned = planRollover({
    current,
    progress,
    nowIso: "2026-04-02T00:00:00.000Z",
    nextRouteId: "route-next",
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(current.startIndex, 26);
  assert.equal(current.grade, 1);
  assert.equal(planned.grade, 2);
  assert.equal(planned.next.grade, 2);
  assert.equal(planned.next.startBand, "beginning");
  assert.equal(planned.next.startIndex, 0);
  assert.equal(planned.next.orderedKanji[0], G2[0]);
  assert.equal(planned.plan.newKanji.includes("円"), false);
  assert.equal(planned.plan.newKanji.includes("一"), false);
  const pack = firstWeekOnNewRoute(planned.next, 5, progress);
  assert.ok(pack.length <= 5);
  assert.equal(pack.includes("一"), false);
  assert.equal(pack.some((ch) => G1.includes(ch) && !G2.includes(ch)), false);
});

test("P2 April prompt is a window, dismiss keeps the current route", () => {
  assert.equal(
    shouldShowAprilPrompt({ grade: 1, nowIso: "2026-03-15T00:00:00.000Z", dismissedSy: null }),
    true,
  );
  assert.equal(
    shouldShowAprilPrompt({ grade: 1, nowIso: "2026-08-24T00:00:00.000Z", dismissedSy: null }),
    false,
  );
  assert.equal(
    shouldShowAprilPrompt({ grade: 1, nowIso: "2026-04-02T00:00:00.000Z", dismissedSy: 2026 }),
    false,
  );
  assert.equal(
    shouldShowAprilPrompt({ grade: 6, nowIso: "2026-03-15T00:00:00.000Z", dismissedSy: null }),
    false,
  );
});

test("P2 projected arrival is a pace estimate, not a guarantee or behind total", () => {
  const now = "2026-08-24T00:00:00.000Z";
  const route = makeGradeRoute({ childId: "c", grade: 1, startBand: "beginning", nowIso: now });
  const empty = buildProjectedArrival({ route, progress: {}, events: [], nowIso: now });
  assert.equal(empty.kind, "unknown");
  assert.equal(empty.remainingAlmost, 80);

  const allBlue: Record<string, ProgressState> = {};
  for (const ch of G1) allBlue[ch] = { ...emptyProgress(ch), status: "almost", almostAt: now };
  const done = buildProjectedArrival({ route, progress: allBlue, events: [], nowIso: now });
  assert.equal(done.kind, "done");
  assert.equal(done.remainingAlmost, 0);

  const half = Math.floor(G1.length / 2);
  const mid: Record<string, ProgressState> = {};
  for (const ch of G1.slice(0, half)) {
    mid[ch] = { ...emptyProgress(ch), status: "almost", almostAt: "2026-08-10T00:00:00.000Z" };
  }
  const pace = buildProjectedArrival({ route, progress: mid, events: [], nowIso: now });
  assert.equal(pace.kind, "pace");
  assert.ok(pace.month);
  assert.equal(pace.overHorizon, false);

  const slow = buildProjectedArrival({
    route,
    progress: {
      一: { ...emptyProgress("一"), status: "perfect", almostAt: now, perfectAt: now },
    },
    events: [],
    nowIso: now,
  });
  assert.equal(slow.kind, "pace");
  assert.equal(slow.overHorizon, true);

  const src = [
    readFileSync(new URL("../src/lib/projected-arrival.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/grade-rollover.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/components/grade-rollover.tsx", import.meta.url), "utf8"),
  ].join("\n");
  assert.equal(/\bevaluateProgress\s*\(/.test(src), false);
  assert.equal(/weeks behind|N weeks behind/i.test(src), false);
});

test("R7 green decay stays off after P2", () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    assert.equal(GRADE_PARAMS[g].perfect_decay_enabled, false);
  }
});

test("P2 new pack helper never dumps another grade's leftovers", () => {
  const next = makeGradeRoute({ childId: "c", grade: 2, startBand: "beginning" });
  const leftover = ["円", "王", "音"];
  const pack = pickWeeklyNew(next.orderedKanji, 0, 5, new Map());
  assert.equal(pack.some((ch) => leftover.includes(ch)), false);
});
