import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { getItem, drawPublishedItems, shapeSurfaceAvailable, gradeChoice } from "../src/lib/items.ts";
import { shapeModeFor, structureType } from "../src/lib/kanji-structure.ts";
import { getPublishedShape, classifyStructure } from "../src/data/shape-catalog.ts";
import { autoGate } from "../src/lib/shape-payload.ts";
import { emptyProgress, evaluateProgress } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import { COMPONENT_COMPLETE_ID } from "../src/lib/component-assembly.ts";
import { STROKE_COMPLETE_ID } from "../src/lib/stroke-assembly.ts";

test("B1 山 is published stroke-drag with 3 strokes", () => {
  const row = getPublishedShape("山");
  assert.ok(row);
  assert.equal(row.structure_type, "primitive");
  assert.equal(row.published_shape, true);
  assert.equal(row.strokes?.length, 3);
  assert.equal(shapeModeFor("山"), "stroke");
  const item = getItem("山:shape:0", true);
  assert.ok(item?.payload.strokeAssembly);
  assert.equal(item.payload.strokeAssembly.strokes.length, 3);
  assert.equal(item.payload.componentAssembly, undefined);
});

test("B2 林 is 木+木, never 8-stroke drag", () => {
  assert.equal(structureType("林"), "compound");
  assert.equal(shapeModeFor("林"), "component");
  const item = getItem("林:shape:0", true);
  assert.ok(item?.payload.componentAssembly);
  assert.deepEqual(
    item.payload.componentAssembly.components.map((c) => c.label),
    ["木", "木"],
  );
  assert.equal(item.payload.strokeAssembly, undefined);
  assert.equal(item.payload.componentAssembly.components.length, 2);
});

test("B3 水 skeleton is 水, not 火", () => {
  const 水 = getPublishedShape("水");
  const 火 = getPublishedShape("火");
  assert.ok(水 && 火);
  assert.equal(水.strokes?.length, 4);
  assert.equal(火.strokes?.length, 4);
  const water2 = 水.strokes![1]!.path;
  const fire2 = 火.strokes![1]!.path;
  assert.notEqual(water2, fire2);
  const startX = (p: string) => Number(p.match(/^M\s*([\d.]+)/)?.[1]);
  assert.ok(startX(water2) < 25);
});

test("B4 unpublished shape data is not served", () => {
  assert.equal(classifyStructure("龍"), null);
  assert.equal(getPublishedShape("龍"), undefined);
  assert.equal(getItem("龍:shape:0", true), null);
  assert.equal(shapeSurfaceAvailable("龍"), false);
  assert.equal(shapeModeFor("龍"), "none");
});

test("B5 child sources do not call a live decompose API", () => {
  const files = [
    "src/lib/quiz.ts",
    "src/lib/items.ts",
    "src/lib/kanji-structure.ts",
    "src/data/shape-catalog.ts",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.equal(/openai|anthropic|fetch\(.*kanjivg|decompose/i.test(src), false, f);
  }
});

test("B6 evaluateProgress is unchanged by the gate", () => {
  const params = getGradeParams(1);
  const next = evaluateProgress(
    emptyProgress("山"),
    {
      type: "answer",
      kind: "shape",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: new Date().toISOString(),
      shapeAvailable: true,
    },
    params,
  );
  assert.equal(next.lights.shape, true);
  assert.notEqual(next.status, "perfect");
});

test("auto-gate rejects empty primitive and 1-piece compound", () => {
  const badP = autoGate({ char: "雨", structure_type: "primitive", strokes: [] });
  assert.equal(badP.published_shape, false);
  const badC = autoGate({
    char: "校",
    structure_type: "compound",
    components: [{ id: "x", label: "木", path_or_asset: "木", slot: 0 }],
  });
  assert.equal(badC.published_shape, false);
});

test("pilot spot-check set is published", () => {
  for (const char of ["山", "川", "木", "日", "水", "林", "森", "明", "花", "王"]) {
    assert.ok(getPublishedShape(char), char);
    assert.ok(getItem(`${char}:shape:0`, true), char);
  }
});

test("drawPublishedItems never includes unpublished shape", () => {
  const missing = drawPublishedItems({
    kanji: "龍",
    kinds: ["reading", "meaning", "shape"],
    seed: "gate|龍",
    maxPerKind: 1,
    maxTotal: 5,
  });
  assert.equal(missing.some((i) => i.kind === "shape"), false);
  const yama = drawPublishedItems({
    kanji: "山",
    kinds: ["shape"],
    seed: "gate|山",
    maxPerKind: 1,
    maxTotal: 3,
  });
  assert.equal(yama.length, 1);
  assert.equal(yama[0]?.payload.strokeAssembly?.strokes.length, 3);
});

test("stroke complete / component complete still grade through published items", () => {
  const yama = getItem("山:shape:0", true)!;
  const hayashi = getItem("林:shape:0", true)!;
  assert.equal(gradeChoice(yama, STROKE_COMPLETE_ID).correct, true);
  assert.equal(gradeChoice(hayashi, COMPONENT_COMPLETE_ID).correct, true);
});
