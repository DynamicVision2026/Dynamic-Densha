import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GRADE_COUNTS, trainsForGrade } from "../src/data/kyoiku.ts";
import { emptyProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import { buildGradeRings, hubCounts } from "../src/lib/train-overview.ts";

function mapOf(rows: ProgressState[]) {
  return new Map(rows.map((r) => [r.kanji, r]));
}

test("rings: profile G1 opens only grade 1; higher are dotted survey", () => {
  const progress = mapOf([
    { ...emptyProgress("一"), status: "perfect" },
    { ...emptyProgress("右"), status: "almost" },
  ]);
  const rings = buildGradeRings({ progress, profileGrade: 1 });
  assert.equal(rings.length, 6);
  assert.equal(rings[0]?.open, true);
  assert.equal(rings[0]?.perfect, 1);
  assert.equal(rings[0]?.ridden, 2);
  assert.equal(rings[0]?.complete, false);
  assert.equal(rings[0]?.consist[0], "一");
  for (const ring of rings.slice(1)) {
    assert.equal(ring.open, false);
    assert.equal(ring.perfect, 0);
    assert.equal(ring.consist.length, 0);
  }
});

test("rings: G3 profile keeps lower grades open and does not hide them", () => {
  const g1 = trainsForGrade(1).flatMap((t) => t.chars);
  const progress = mapOf(g1.slice(0, 3).map((k) => ({ ...emptyProgress(k), status: "perfect" as const })));
  const rings = buildGradeRings({ progress, profileGrade: 3 });
  assert.equal(rings.filter((r) => r.open).map((r) => r.grade).join(","), "1,2,3");
  assert.equal(rings[0]?.perfect, 3);
  assert.equal(rings[3]?.open, false);
  assert.equal(rings[4]?.open, false);
  assert.equal(rings[5]?.open, false);
});

test("consist is curriculum order of perfect cars only", () => {
  const chars = trainsForGrade(1)[0]!.chars;
  const progress = mapOf([
    { ...emptyProgress(chars[2]!), status: "perfect" },
    { ...emptyProgress(chars[0]!), status: "perfect" },
    { ...emptyProgress(chars[1]!), status: "almost" },
  ]);
  const rings = buildGradeRings({ progress, profileGrade: 1 });
  assert.deepEqual(rings[0]?.consist, [chars[0], chars[2]]);
});

test("grade-complete when every car in the grade is perfect", () => {
  const chars = trainsForGrade(1).flatMap((t) => t.chars);
  assert.equal(chars.length, GRADE_COUNTS[1]);
  const progress = mapOf(chars.map((k) => ({ ...emptyProgress(k), status: "perfect" as const })));
  const rings = buildGradeRings({ progress, profileGrade: 1 });
  assert.equal(rings[0]?.complete, true);
  assert.equal(rings[0]?.perfect, 80);
});

test("hub counts are aggregates of the view grade, not 1026", () => {
  const src = readFileSync("src/lib/train-overview.ts", "utf8");
  assert.match(src, /never all 1026/);
  const rings = buildGradeRings({ progress: new Map(), profileGrade: 1 });
  const hub = hubCounts(rings, 1);
  assert.equal(hub.green, 0);
  assert.equal(hub.ridden, 0);
});

test("overview is UI state on child home, not a peer route", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  const hub = readFileSync("src/components/hub-plate.tsx", "utf8");
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  const couple = readFileSync("src/components/couple-beat.tsx", "utf8");
  assert.match(home, /WelcomeOverview/);
  assert.match(home, /HubPlate/);
  assert.match(hub, /data-open-overview/);
  assert.match(home, /landscape:w-\[40%\]/);
  assert.equal(/createFileRoute/.test(readFileSync("src/components/welcome-overview.tsx", "utf8")), false);
  assert.equal(/WatchDemoButton|loginParent|workshopTry/.test(home), false);
  assert.match(session, /CoupleBeat/);
  assert.match(session, /justReachedPerfect/);
  assert.match(session, /seeTrain/);
  assert.match(couple, /coupleTitle/);
  assert.equal(/confetti|mascot/.test(couple), false);
});
