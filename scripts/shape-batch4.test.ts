import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { getClozeItem, getItem, shapeSurfaceAvailable } from "../src/lib/items.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";
import { classifyStructure, getPublishedShape } from "../src/data/shape-catalog.ts";

function packageChars(grade: number) {
  return KYOIKU.filter((k) => k.grade === grade && (grade === 1 || hasEchoBundle(k.char)));
}

test("G1 published_shape ≥70, stretch 80/80", () => {
  const n = packageChars(1).filter((k) => getPublishedShape(k.char)).length;
  assert.ok(n >= 70, String(n));
  assert.equal(n, 80);
});

test("G2–G6 package published_shape ≥80%", () => {
  const min: Record<number, number> = { 2: 0.8, 3: 0.8, 4: 0.8, 5: 0.8, 6: 0.8 };
  for (const g of [2, 3, 4, 5, 6]) {
    const pkg = packageChars(g);
    const n = pkg.filter((k) => getPublishedShape(k.char)).length;
    assert.ok(n / pkg.length >= min[g]!, `G${g} ${n}/${pkg.length}`);
  }
});

test("regression: 山 strokes, 林 components", () => {
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("川"), "stroke");
  assert.equal(shapeModeFor("木"), "stroke");
  assert.equal(shapeModeFor("日"), "stroke");
  assert.equal(shapeModeFor("水"), "stroke");
  assert.equal(shapeModeFor("人"), "stroke");
  assert.equal(shapeModeFor("火"), "stroke");
  assert.equal(shapeModeFor("王"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(shapeModeFor("森"), "component");
  assert.equal(shapeModeFor("明"), "component");
  assert.equal(shapeModeFor("花"), "component");
  const hayashi = getItem("林:shape:0", true);
  assert.deepEqual(hayashi?.payload.componentAssembly?.components.map((c) => c.label), ["木", "木"]);
  assert.equal(hayashi?.payload.strokeAssembly, undefined);
  const yama = getItem("山:shape:0", true);
  assert.equal(yama?.payload.strokeAssembly?.strokes.length, 3);
  assert.equal(yama?.payload.componentAssembly, undefined);
});

test("unpublished 龍 has no shape item; cloze still independent", () => {
  assert.equal(classifyStructure("龍"), null);
  assert.equal(getPublishedShape("龍"), undefined);
  assert.equal(shapeSurfaceAvailable("龍"), false);
  assert.ok(getClozeItem("犬"));
  assert.ok(getPublishedShape("犬"));
});
