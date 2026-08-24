import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { teachReadyReport, isTeachReady } from "../src/lib/teach-ready.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { hasEncounter } from "../src/lib/encounters.ts";
import { getPublishedShape } from "../src/data/shape-catalog.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

test("G1–G3 do not regress", () => {
  assert.equal(KYOIKU.filter((k) => k.grade === 1 && isTeachReady(k.char)).length, 80);
  assert.equal(KYOIKU.filter((k) => k.grade === 2 && isTeachReady(k.char)).length, 160);
  assert.equal(KYOIKU.filter((k) => k.grade === 3 && isTeachReady(k.char)).length, 200);
});

test("G4 full 配当 is teach_ready", () => {
  const g4 = KYOIKU.filter((k) => k.grade === 4);
  assert.equal(g4.length, 202);
  const blocked = g4
    .filter((k) => !isTeachReady(k.char))
    .map((k) => k.char + ":" + teachReadyReport(k.char).fails.join("+"));
  assert.deepEqual(blocked, []);
  for (const k of g4) {
    assert.equal(hasEchoBundle(k.char), true, k.char);
    assert.equal(hasEncounter(k.char), true, k.char);
    assert.ok(getPublishedShape(k.char), k.char);
  }
});

test("package QA samples still hold after G4", () => {
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(isTeachReady("右"), true);
  assert.equal(isTeachReady("未"), true);
  assert.equal(isTeachReady("末"), true);
});
