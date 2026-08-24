import assert from "node:assert/strict";
import { test } from "node:test";
import { structureConfirm, structureHint, structureRetry } from "../src/lib/shape-copy.ts";
import { getStrokeAssembly } from "../src/data/stroke-assembly.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

test("T2 林 compound: hint before input, confirm on success", () => {
  assert.equal(structureHint("林"), "き が ふたつ");
  assert.equal(structureConfirm("林"), "木と木で 林");
  assert.equal(structureRetry("林"), "き が ふたつ");
  assert.equal(shapeModeFor("林"), "component");
});

test("T2 森 / 明 / 休 editorial overlays", () => {
  assert.equal(structureHint("森"), "き が みっつ");
  assert.equal(structureConfirm("森"), "木と木と木で 森");
  assert.equal(structureHint("明"), "ひ と つき");
  assert.equal(structureConfirm("明"), "日と月で 明");
  assert.equal(structureHint("休"), "ひと と き");
  assert.equal(structureConfirm("休"), "人と木で 休");
});

test("T2 王 primitive: ordered-stroke copy, still 4 strokes", () => {
  assert.equal(shapeModeFor("王"), "stroke");
  assert.equal(structureHint("王"), "じゅんばんに おく");
  assert.equal(structureConfirm("王"), "じゅんばんどおり");
  assert.equal(getStrokeAssembly("王")?.strokes.length, 4);
});

test("T2 generic compound templates from dictionary", () => {
  assert.equal(structureHint("好"), "女 と 子");
  assert.equal(structureConfirm("好"), "女と子で 好");
  assert.equal(structureHint("村"), "木 と 寸");
  assert.equal(structureConfirm("村"), "木と寸で 村");
});
