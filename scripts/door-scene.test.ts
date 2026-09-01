import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { DOOR_CONSIST, doorRings } from "../src/lib/door-scene.ts";
import { CAR_CAP } from "../src/lib/welcome-switchback.ts";

const G1_CHARS = new Set(KYOIKU.filter((k) => k.grade === 1).map((k) => k.char));

test("26-car door consist: exactly 26, all unique, all real G1 curriculum characters", () => {
  assert.equal(DOOR_CONSIST.length, 26);
  assert.equal(new Set(DOOR_CONSIST).size, 26);
  for (const char of DOOR_CONSIST) {
    assert.ok(G1_CHARS.has(char), `${char} is not a G1 curriculum character`);
  }
});

test("door consist keeps 一 first (it's also the hardcoded landing CTA target)", () => {
  assert.equal(DOOR_CONSIST[0], "一");
  const src = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(src, /params=\{\{\s*char:\s*"一"\s*\}\}/);
});

test("doorRings grade-1 sample is the full 26-car consist, never exceeding the real G1 total", () => {
  const rings = doorRings(1);
  const g1 = rings.find((r) => r.grade === 1);
  assert.ok(g1);
  assert.equal(g1.consist.length, 26);
  assert.ok(g1.consist.length <= g1.total);
  for (const grade of [2, 3, 4, 5, 6] as const) {
    assert.equal(rings.find((r) => r.grade === grade)?.consist.length, 0);
  }
});

test("landing's 26-car cap is opt-in and doesn't change the real per-grade overview's default", () => {
  // The real (non-decorative) per-grade overview screen must keep rendering
  // at most CAR_CAP cars unless it explicitly opts into a larger cap — the
  // 26-car door train is landing-page-only decoration, not a change to how
  // a real learner's mastered-kanji consist renders.
  assert.equal(CAR_CAP, 12);
  const overview = readFileSync("src/components/welcome-overview.tsx", "utf8");
  assert.match(overview, /carCap = CAR_CAP/);
  const childHome = readFileSync("src/components/child-home.tsx", "utf8");
  assert.equal(/carCap/.test(childHome), false);
  const index = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(index, /carCap=\{DOOR_CONSIST\.length\}/);
});
