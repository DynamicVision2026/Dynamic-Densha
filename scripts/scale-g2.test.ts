import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { teachReadyReport, isTeachReady } from "../src/lib/teach-ready.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { hasEncounter } from "../src/lib/encounters.ts";
import { getPublishedShape } from "../src/data/shape-catalog.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

test("G1 stays 80/80 teach_ready", () => {
  const g1 = KYOIKU.filter((k) => k.grade === 1);
  assert.equal(g1.length, 80);
  assert.equal(g1.filter((k) => isTeachReady(k.char)).length, 80);
});

test("G2 full 配当 is teach_ready", () => {
  const g2 = KYOIKU.filter((k) => k.grade === 2);
  assert.equal(g2.length, 160);
  const blocked = g2.filter((k) => !isTeachReady(k.char)).map((k) => k.char + ":" + teachReadyReport(k.char).fails.join("+"));
  assert.deepEqual(blocked, []);
  for (const k of g2) {
    assert.equal(hasEchoBundle(k.char), true, k.char);
    assert.equal(hasEncounter(k.char), true, k.char);
    assert.ok(getPublishedShape(k.char), k.char);
  }
});

test("package QA samples still hold", () => {
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(isTeachReady("右"), true);
  assert.equal(isTeachReady("犬"), true);
});
