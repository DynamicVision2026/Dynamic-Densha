import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { teachReadyReport, isTeachReady } from "../src/lib/teach-ready.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { hasEncounter } from "../src/lib/encounters.ts";
import { getPublishedShape } from "../src/data/shape-catalog.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

test("G1–G5 do not regress", () => {
  assert.equal(KYOIKU.filter((k) => k.grade === 1 && isTeachReady(k.char)).length, 80);
  assert.equal(KYOIKU.filter((k) => k.grade === 2 && isTeachReady(k.char)).length, 160);
  assert.equal(KYOIKU.filter((k) => k.grade === 3 && isTeachReady(k.char)).length, 200);
  assert.equal(KYOIKU.filter((k) => k.grade === 4 && isTeachReady(k.char)).length, 202);
  assert.equal(KYOIKU.filter((k) => k.grade === 5 && isTeachReady(k.char)).length, 193);
});

test("G6 full 配当 is teach_ready", () => {
  const g6 = KYOIKU.filter((k) => k.grade === 6);
  assert.equal(g6.length, 191);
  const blocked = g6
    .filter((k) => !isTeachReady(k.char))
    .map((k) => k.char + ":" + teachReadyReport(k.char).fails.join("+"));
  assert.deepEqual(blocked, []);
  for (const k of g6) {
    assert.equal(hasEchoBundle(k.char), true, k.char);
    assert.equal(hasEncounter(k.char), true, k.char);
    assert.ok(getPublishedShape(k.char), k.char);
  }
});

test("full 1026 kyoiku is teach_ready or listed", () => {
  const blocked = KYOIKU.filter((k) => !isTeachReady(k.char)).map(
    (k) => `G${k.grade}:${k.char}:${teachReadyReport(k.char).fails.join("+")}`,
  );
  assert.deepEqual(blocked, []);
  assert.equal(KYOIKU.length, 1026);
});

test("package QA samples still hold after G6", () => {
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(isTeachReady("右"), true);
  assert.equal(isTeachReady("乱"), true);
});
