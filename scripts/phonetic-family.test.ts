import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PHONETIC_FAMILIES } from "../src/data/phonetic-families.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import {
  FAMILY_HIT_ID,
  FAMILY_SHIFT_ID,
  buildFamilyQuiz,
  classifyFamilyChoice,
  familyFor,
} from "../src/lib/phonetic-family.ts";
import { getPhoneticFamilyItem, gradeChoice } from "../src/lib/items.ts";
import { isElementaryReading } from "../src/lib/readings.ts";

test("pilot 青/セイ family: four houses, 請 omitted, readings are elementary", () => {
  const family = PHONETIC_FAMILIES[0];
  assert.ok(family);
  assert.equal(family.phonetic.kanji, "青");
  assert.equal(family.phonetic.reading, "セイ");
  assert.equal(family.members.length, 4);
  assert.equal(family.members.some((m) => m.kanji === "請"), false);
  assert.ok(isElementaryReading("青", "セイ"));
  for (const m of family.members) {
    assert.ok(isElementaryReading(m.kanji, m.expected_reading), `${m.kanji} ${m.expected_reading}`);
  }
});

test("清/晴/静 are 当たり セイ; 情 is 半分当たり ジョウ", () => {
  const 晴 = familyFor("晴")!.members.find((m) => m.kanji === "晴")!;
  const 情 = familyFor("情")!.members.find((m) => m.kanji === "情")!;
  assert.equal(classifyFamilyChoice(晴, "セイ"), "hit");
  assert.equal(classifyFamilyChoice(情, "ジョウ"), "hit");
  assert.equal(classifyFamilyChoice(情, "セイ"), "shift");
  assert.equal(classifyFamilyChoice(晴, "ジョウ"), "miss");
});

test("family quiz is a published reading item, not a fourth light", () => {
  const item = getPhoneticFamilyItem("晴");
  assert.ok(item);
  assert.equal(item.kind, "reading");
  assert.equal(item.status, "published");
  assert.ok(item.payload.phoneticFamily);
  assert.equal(gradeChoice(item, FAMILY_HIT_ID).correct, true);
  assert.equal(gradeChoice(item, FAMILY_SHIFT_ID).correct, false);
});

test("G1–G2 do not enable family injection; G3+ do", () => {
  assert.equal(getGradeParams(1).phonetic_family_enabled, false);
  assert.equal(getGradeParams(2).phonetic_family_enabled, false);
  assert.equal(getGradeParams(3).phonetic_family_enabled, true);
  assert.equal(getGradeParams(5).phonetic_family_enabled, true);
});

test("buildFamilyQuiz for 青 stone uses elementary セイ", () => {
  const quiz = buildFamilyQuiz("青");
  assert.ok(quiz);
  assert.equal(quiz.kind, "reading");
  assert.equal(quiz.phoneticFamily?.expected_reading, "セイ");
  assert.ok(quiz.choices.some((c) => c.label === "セイ" && c.correct));
});

test("P1-2 workshop routes never call submitPractice / submitDemoAnswer", () => {
  const app = readFileSync("src/routes/app/workshop.tsx", "utf8");
  const demo = readFileSync("src/routes/demo/workshop.tsx", "utf8");
  const helper = readFileSync("src/lib/demo-progress.ts", "utf8");
  assert.equal(/submitPractice/.test(app), false);
  assert.equal(/submitDemoAnswer/.test(demo), false);
  assert.match(helper, /Workshop: UI-only/);
  assert.equal(/sessionId: "workshop"/.test(helper), false);
});
