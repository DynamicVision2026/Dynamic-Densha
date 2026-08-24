import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { KYOIKU } from "../src/data/kyoiku.ts";
import {
  encounterLines,
  getEncounter,
  hasEncounter,
  encounterIllustration,
} from "../src/lib/encounters.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { isTeachReady, teachReadyReport } from "../src/lib/teach-ready.ts";
import { emptyProgress, evaluateProgress } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";

function packageChars(grade: number) {
  return KYOIKU.filter((k) => k.grade === grade && (grade === 1 || hasEchoBundle(k.char)));
}

test("G1 80/80 encounter with 2–4 JA lines", () => {
  const pkg = packageChars(1);
  assert.equal(pkg.length, 80);
  for (const k of pkg) {
    assert.equal(hasEncounter(k.char), true, k.char);
    const row = getEncounter(k.char)!;
    const n = encounterLines(row.body_ja).length;
    assert.ok(n >= 2 && n <= 4, `${k.char} lines ${n}`);
    assert.ok(row.illustration);
  }
});

test("G2–G6 package 100% encounter", () => {
  for (const g of [2, 3, 4, 5, 6]) {
    for (const k of packageChars(g)) {
      assert.equal(hasEncounter(k.char), true, `G${g} ${k.char}`);
    }
  }
});

test("template fallback still counts; 龍 has no encounter", () => {
  const yama = getEncounter("山")!;
  assert.equal(encounterIllustration(yama).startsWith("motif:"), true);
  const hiku = getEncounter("引")!;
  assert.equal(encounterIllustration(hiku), "template");
  assert.equal(getEncounter("龍"), null);
  assert.equal(hasEncounter("龍"), false);
});

test("teach_ready imagery uses encounter, not YouTube", () => {
  assert.equal(teachReadyReport("山").checks.imagery, true);
  assert.equal(isTeachReady("山"), true);
  const src = readFileSync(new URL("../src/components/kanji-session.tsx", import.meta.url), "utf8");
  assert.equal(/youtube|youtu\.be/i.test(src), false);
});

test("encounter completion does not invent lamps", () => {
  const params = getGradeParams(1);
  const next = evaluateProgress(
    emptyProgress("山"),
    { type: "completeEncounter", nowIso: "2026-08-23T00:00:00.000Z" },
    params,
  );
  assert.equal(next.encounterCompleted, true);
  assert.equal(next.lights.reading, false);
  assert.equal(next.lights.meaning, false);
  assert.equal(next.lights.shape, false);
  assert.equal(next.status, "new");
});
