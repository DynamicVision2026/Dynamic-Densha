import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { CLOZE_SELECT } from "../src/data/cloze-select.ts";
import { clozeFor, buildClozeQuiz } from "../src/lib/cloze.ts";
import { isTeachReady } from "../src/lib/teach-ready.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

function coverage(grade: number): { n: number; hit: number; pct: number } {
  const chars = KYOIKU.filter((k) => k.grade === grade);
  const hit = chars.filter((k) => clozeFor(k.char)).length;
  return { n: chars.length, hit, pct: hit / chars.length };
}

test("W6.2 cloze drafts are well-formed", () => {
  for (const [char, draft] of Object.entries(CLOZE_SELECT)) {
    assert.equal(draft.answer, char, char);
    assert.equal((draft.frame_ja.match(/___/g) || []).length, 1, char + " " + draft.frame_ja);
    assert.ok(draft.choices.includes(char), char);
    assert.ok(draft.choices.length >= 3, char);
  }
});

test("W6.2 coverage: G1 80/80, G2 ≥80%, G3–G6 ≥60%", () => {
  const g1 = coverage(1);
  assert.equal(g1.hit, 80, `G1 ${g1.hit}`);
  const g2 = coverage(2);
  assert.ok(g2.pct >= 0.8, `G2 ${g2.hit}/${g2.n}`);
  for (const g of [3, 4, 5, 6]) {
    const row = coverage(g);
    assert.ok(row.pct >= 0.6, `G${g} ${row.hit}/${row.n}`);
  }
});

test("W6.2 cloze still lights shape only; golden samples hold", () => {
  const dog = buildClozeQuiz("犬");
  assert.equal(dog?.kind, "shape");
  assert.equal(dog?.cloze?.answer, "犬");
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(isTeachReady("右"), true);
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
});
