import assert from "node:assert/strict";
import { test } from "node:test";
import { getComponentAssembly, componentAssemblyChars } from "../src/data/component-assembly.ts";
import { KANJI_LINES } from "../src/data/lines.ts";
import { getStrokeAssembly, strokeAssemblyChars } from "../src/data/stroke-assembly.ts";
import { getItem, gradeChoice } from "../src/lib/items.ts";
import { shapeModeFor, structureType } from "../src/lib/kanji-structure.ts";
import {
  STROKE_COMPLETE_ID,
  STROKE_SKIP_ID,
  isAssemblyComplete,
  isNextStroke,
} from "../src/lib/stroke-assembly.ts";
import { evaluateProgress, emptyProgress } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import { COMPONENT_COMPLETE_ID } from "../src/lib/component-assembly.ts";

test("pilot set exposes stroke_assembly for primitives", () => {
  assert.ok(strokeAssemblyChars().length >= 10);
  for (const char of strokeAssemblyChars()) {
    const row = getStrokeAssembly(char);
    assert.ok(row, char);
    assert.equal(row.char, char);
    assert.ok(row.strokes.length >= 1);
    assert.ok(row.strokes.every((s) => s.id && s.path));
    assert.equal(getComponentAssembly(char), undefined, `${char} must not also be compound`);
    assert.equal(structureType(char), "primitive");
    assert.equal(shapeModeFor(char), "stroke");
  }
});

test("山 is three strokes: 中縦, 左+底の折れ, 右縦 — never a 巾-like top 冂", () => {
  const 山 = getStrokeAssembly("山");
  assert.ok(山);
  assert.equal(山.strokes.length, 3);
  assert.equal(山.strokes[0]?.label, "たて");
  assert.equal(山.strokes[1]?.label, "おれ");
  assert.equal(山.strokes[2]?.label, "たて");
  assert.equal(山.strokes[1]?.path.includes("L 78 40"), false);
});

test("水 is not 大: left stroke is separate, right is two はらい", () => {
  const 水 = getStrokeAssembly("水");
  assert.ok(水);
  assert.equal(水.strokes.length, 4);
  const startX = (p: string) => Number(p.match(/^M\s*([\d.]+)/)?.[1]);
  assert.ok(startX(水.strokes[1]!.path) < 25, "2画 starts on the left, not from the stem");
  assert.ok(startX(水.strokes[2]!.path) > 60, "3画 starts on the upper right");
  assert.ok(startX(水.strokes[3]!.path) > 45 && startX(水.strokes[3]!.path) < 60);
});

test("日 keeps textbook 折れ as stroke 2", () => {
  const 日 = getStrokeAssembly("日");
  assert.ok(日);
  assert.equal(日.strokes[1]?.label, "おれ");
});

test("out-of-order stroke never counts as next", () => {
  const 木 = getStrokeAssembly("木");
  assert.ok(木);
  assert.equal(isNextStroke(木, 0, 木.strokes[0]!.id), true);
  assert.equal(isNextStroke(木, 0, 木.strokes[1]!.id), false);
  assert.equal(isNextStroke(木, 1, 木.strokes[0]!.id), false);
  assert.equal(isNextStroke(木, 1, 木.strokes[1]!.id), true);
  assert.equal(isAssemblyComplete(木, 3), false);
  assert.equal(isAssemblyComplete(木, 4), true);
});

test("completing stroke order grades as a successful shape answer", () => {
  const item = getItem("山:shape:0", true);
  assert.ok(item?.payload.strokeAssembly);
  assert.equal(gradeChoice(item, STROKE_COMPLETE_ID).correct, true);
  assert.equal(gradeChoice(item, STROKE_SKIP_ID).correct, false);
});

test("右 is ナ+口 component assembly, not leftover MCQ", () => {
  const item = getItem("右:shape:0", true);
  assert.ok(item);
  assert.equal(item.payload.strokeAssembly, undefined);
  assert.ok(item.payload.componentAssembly);
  assert.deepEqual(
    item.payload.componentAssembly.components.map((c) => c.label),
    ["ナ", "口"],
  );
  assert.equal(gradeChoice(item, COMPONENT_COMPLETE_ID).correct, true);
});

test("successful stroke assembly only lights the existing shape lamp", () => {
  const params = getGradeParams(1);
  const prev = emptyProgress("山");
  const next = evaluateProgress(
    prev,
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
  assert.equal(next.status === "perfect", false);
  assert.notEqual(next.status, "perfect");
});

test("every line station has stroke or component shape, never mixed", () => {
  const stations = KANJI_LINES.flatMap((l) => l.stations.map((s) => s.kanji));
  for (const char of stations) {
    const mode = shapeModeFor(char);
    assert.notEqual(mode, "mcq", `${char} on a line must not fall back to MCQ`);
    if (mode === "stroke") {
      assert.ok(getStrokeAssembly(char), char);
      assert.equal(getComponentAssembly(char), undefined, char);
    } else {
      assert.ok(getComponentAssembly(char), char);
      assert.equal(getStrokeAssembly(char), undefined, char);
    }
  }
});

test("林 still two 木; 休 is 人+木; 校 is not on 木の線 but still 木+交", () => {
  assert.deepEqual(
    getComponentAssembly("林")?.components.map((c) => c.label),
    ["木", "木"],
  );
  assert.deepEqual(
    getComponentAssembly("休")?.components.map((c) => c.label),
    ["人", "木"],
  );
  assert.ok(getComponentAssembly("校"));
  assert.equal(
    KANJI_LINES.find((l) => l.id === "line_ki")?.stations.some((s) => s.kanji === "校"),
    false,
  );
});

test("compound list is disjoint from stroke list", () => {
  const strokes = new Set(strokeAssemblyChars());
  for (const char of componentAssemblyChars()) {
    assert.equal(strokes.has(char), false, char);
    assert.equal(structureType(char), "compound");
    assert.equal(shapeModeFor(char), "component");
  }
});
