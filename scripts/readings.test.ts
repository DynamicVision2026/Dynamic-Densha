import assert from "node:assert/strict";
import { test } from "node:test";
import { getKanji, KYOIKU } from "../src/data/kyoiku.ts";
import { gradeChoice, getItem, type BankItem } from "../src/lib/items.ts";
import {
  elementaryReadings,
  elementaryReadingsOf,
  isElementaryReading,
  laterStageReadings,
  primaryElementaryReading,
} from "../src/lib/readings.ts";
import { isShapeSkeletonCorrect } from "../src/lib/shape.ts";

function sameSet(actual: string[], expected: string[]) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

test("every kanji has a non-null elementaryReadings object", () => {
  assert.equal(KYOIKU.length, 1026);
  for (const k of KYOIKU) {
    assert.ok(k.elementaryReadings, k.char);
    assert.ok(Array.isArray(k.elementaryReadings.onyomi), k.char);
    assert.ok(Array.isArray(k.elementaryReadings.kunyomi), k.char);
  }
});

test("fixtures: 麦 行 円 王 雨 match the official 小学校 column", () => {
  const 麦 = getKanji("麦");
  assert.ok(麦);
  sameSet(麦.elementaryReadings.onyomi, []);
  sameSet(麦.elementaryReadings.kunyomi, ["むぎ"]);

  const 行 = getKanji("行");
  assert.ok(行);
  sameSet(行.elementaryReadings.onyomi, ["コウ", "ギョウ"]);
  sameSet(行.elementaryReadings.kunyomi, ["いく", "ゆく", "おこなう"]);

  const 円 = getKanji("円");
  assert.ok(円);
  sameSet(円.elementaryReadings.onyomi, ["エン"]);
  sameSet(円.elementaryReadings.kunyomi, ["まるい"]);

  const 王 = getKanji("王");
  assert.ok(王);
  sameSet(王.elementaryReadings.onyomi, ["オウ"]);
  sameSet(王.elementaryReadings.kunyomi, []);

  const 雨 = getKanji("雨");
  assert.ok(雨);
  sameSet(雨.elementaryReadings.onyomi, ["ウ"]);
  sameSet(雨.elementaryReadings.kunyomi, ["あめ", "あま"]);
});

test("understand-beat field never lists a non-elementary reading", () => {
  const leaks: string[] = [];
  for (const [char, bad] of [
    ["麦", "バク"],
    ["行", "アン"],
    ["円", "まろやか"],
    ["円", "まど"],
    ["王", "ノウ"],
    ["雨", "さめ"],
  ] as const) {
    const r = elementaryReadingsOf(char);
    const all = [...r.onyomi, ...r.kunyomi];
    if (all.includes(bad)) leaks.push(`${char}:${bad}`);
  }
  assert.deepEqual(leaks, []);
});

test("official elementary set includes 小学校 ○ and excludes 中高", () => {
  assert.ok(elementaryReadings("麦").includes("むぎ"));
  assert.equal(isElementaryReading("麦", "むぎ"), true);
  assert.equal(isElementaryReading("麦", "バク"), false);
  assert.ok(laterStageReadings("麦").includes("バク"));

  assert.equal(isElementaryReading("行", "コウ"), true);
  assert.equal(isElementaryReading("行", "いく"), true);
  assert.equal(isElementaryReading("行", "アン"), false);

  assert.equal(isElementaryReading("円", "エン"), true);
  assert.equal(isElementaryReading("円", "まるい"), true);
  assert.equal(isElementaryReading("円", "まろやか"), false);
  assert.equal(isElementaryReading("円", "まど"), false);

  assert.equal(isElementaryReading("王", "オウ"), true);
  assert.equal(isElementaryReading("王", "ノウ"), false);
});

test("reading match folds kana so バク and ばく are the same token", () => {
  assert.equal(isElementaryReading("麦", "ばく"), false);
  assert.equal(isElementaryReading("一", "いち"), true);
  assert.equal(isElementaryReading("一", "イチ"), true);
});

test("every kyōiku kanji has a non-empty elementary allocation list", () => {
  const empty = KYOIKU.filter((k) => elementaryReadings(k.char).length === 0).map((k) => k.char);
  assert.deepEqual(empty, []);
});

test("gradeChoice rejects a non-elementary reading even if the payload marks it correct", () => {
  const published = getItem("麦:reading:0", true);
  assert.ok(published);
  const trap: BankItem = {
    ...published,
    payload: {
      ...published.payload,
      choices: [
        ...published.payload.choices,
        { id: "trap-baku", label: "バク", correct: true },
      ],
    },
  };
  assert.equal(gradeChoice(trap, "trap-baku").correct, false);
  const primary = primaryElementaryReading("麦");
  assert.ok(primary);
  const right = trap.payload.choices.find((c) => c.label === primary);
  if (right) assert.equal(gradeChoice(trap, right.id).correct, true);
});

test("shape skeleton: same 字体 passes; とめ・はね・はらい do not fail; other char fails", () => {
  for (const variant of ["canonical", "tome", "hane", "harai"] as const) {
    assert.equal(isShapeSkeletonCorrect({ expected: "木", chosen: "木", variant }), true);
  }
  assert.equal(isShapeSkeletonCorrect({ expected: "木", chosen: "本", variant: "hane" }), false);
});

test("unpublished shape is not served as MCQ", () => {
  assert.equal(getItem("龍:shape:0", true), null);
});
