import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { echoSurfacesFor, isWordSurface, isLegalEchoTransition } from "../src/lib/echo-surfaces.ts";
import { foldReading, isElementaryReading } from "../src/lib/readings.ts";
import { isTeachReady } from "../src/lib/teach-ready.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

function distinctSameReadingWords(char: string): number {
  const words = echoSurfacesFor(char).filter((s) => isWordSurface(s) && s.kind !== "same_word_new_frame");
  const byRead = new Map<string, Set<string>>();
  for (const s of words) {
    const f = foldReading(s.reading);
    if (!byRead.has(f)) byRead.set(f, new Set());
    byRead.get(f)!.add(s.text);
  }
  let max = 0;
  for (const set of byRead.values()) max = Math.max(max, set.size);
  return max;
}

function pct(grade: number): number {
  const chars = KYOIKU.filter((k) => k.grade === grade);
  const multi = chars.filter((k) => distinctSameReadingWords(k.char) >= 2).length;
  return (100 * multi) / chars.length;
}

test("W6.1 every extra reading is elementary", () => {
  for (const k of KYOIKU) {
    for (const s of echoSurfacesFor(k.char)) {
      if (s.id.endsWith(":solo")) continue;
      assert.equal(isElementaryReading(k.char, s.reading), true, `${k.char}:${s.text}:${s.reading}`);
    }
  }
});

test("W6.1 G1 ≥70% and G2 ≥60% have two distinct same-reading words", () => {
  assert.ok(pct(1) >= 70, "G1 " + pct(1));
  assert.ok(pct(2) >= 60, "G2 " + pct(2));
});

test("W6.1 G3–G6 each gain ≥15pp vs 0% baseline", () => {
  assert.ok(pct(3) >= 15, "G3 " + pct(3));
  assert.ok(pct(4) >= 15, "G4 " + pct(4));
  assert.ok(pct(5) >= 15, "G5 " + pct(5));
  assert.ok(pct(6) >= 15, "G6 " + pct(6));
});

test("W6.1 does not regress teach_ready or golden samples", () => {
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(isTeachReady("右"), true);
  assert.equal(isTeachReady("犬"), true);
  assert.equal(isLegalEchoTransition("右", "右:右手", "右:右側"), true);
  assert.equal(isLegalEchoTransition("右", "右:右手", "右:左右"), false);
});
