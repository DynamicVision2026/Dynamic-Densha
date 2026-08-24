import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { KANJI_LINES } from "../src/data/lines.ts";
import { PHONETIC_FAMILIES } from "../src/data/phonetic-families.ts";
import { isOnLine, mapLinesFor } from "../src/lib/lines.ts";
import {
  FAMILY_HIT_ID,
  FAMILY_SHIFT_ID,
  buildFamilyQuiz,
  chipsForFamily,
  classifyFamilyChoice,
  familyById,
  familyFor,
} from "../src/lib/phonetic-family.ts";
import { getPhoneticFamilyItem, gradeChoice } from "../src/lib/items.ts";
import { isElementaryReading } from "../src/lib/readings.ts";
import { isTeachReady } from "../src/lib/teach-ready.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";

test("W6.4 +3 curated lines and みず extension; 校 still off 木の線", () => {
  const ids = KANJI_LINES.map((l) => l.id);
  assert.ok(ids.includes("line_kuchi"));
  assert.ok(ids.includes("line_tsuchi"));
  assert.ok(ids.includes("line_ka"));
  assert.ok(ids.includes("line_chu"));
  assert.deepEqual(
    KANJI_LINES.find((l) => l.id === "line_ki")!.stations.map((s) => s.kanji),
    ["木", "林", "森"],
  );
  assert.equal(isOnLine("校", "line_ki"), false);
  assert.equal(isOnLine("秋", "line_ka"), false);
  assert.equal(isOnLine("寺", "line_tsuchi"), false);
  assert.equal(isOnLine("古", "line_kuchi"), false);
  assert.equal(isOnLine("沖", "line_chu"), false);
  assert.equal(isOnLine("虫", "line_chu"), false);
  assert.equal(isOnLine("湖", "line_mizu"), true);
  const g1 = mapLinesFor(1).map((r) => r.line.id);
  assert.ok(g1.includes("line_kuchi"));
  assert.ok(g1.includes("line_ka"));
});

test("W6.4 工 and 主 families playable; 青 pilot intact", () => {
  assert.equal(PHONETIC_FAMILIES[0]!.phonetic.kanji, "青");
  const kou = familyById("kou_kou")!;
  const shu = familyById("shu_shu")!;
  assert.equal(kou.phonetic.kanji, "工");
  assert.equal(shu.phonetic.kanji, "主");
  for (const family of PHONETIC_FAMILIES) {
    assert.ok(isElementaryReading(family.phonetic.kanji, family.phonetic.reading), family.id);
    for (const m of family.members) {
      assert.ok(isElementaryReading(m.kanji, m.expected_reading), `${m.kanji} ${m.expected_reading}`);
    }
  }
  const 空 = kou.members.find((m) => m.kanji === "空")!;
  assert.equal(classifyFamilyChoice(空, "クウ"), "hit");
  assert.equal(classifyFamilyChoice(空, "コウ"), "shift");
  const 功 = kou.members.find((m) => m.kanji === "功")!;
  assert.equal(classifyFamilyChoice(功, "コウ"), "hit");
  const 仲 = shu.members.find((m) => m.kanji === "注")!;
  assert.equal(classifyFamilyChoice(仲, "チュウ"), "hit");
  assert.equal(classifyFamilyChoice(仲, "シュ"), "shift");
  const 情 = familyFor("情")!.members.find((m) => m.kanji === "情")!;
  assert.equal(classifyFamilyChoice(情, "ジョウ"), "hit");
  assert.equal(classifyFamilyChoice(情, "セイ"), "shift");
});

test("W6.4 family quizzes stay reading items; chips are per family", () => {
  const empty = getPhoneticFamilyItem("空")!;
  assert.equal(empty.kind, "reading");
  assert.equal(empty.status, "published");
  assert.equal(gradeChoice(empty, FAMILY_HIT_ID).correct, true);
  assert.equal(gradeChoice(empty, FAMILY_SHIFT_ID).correct, false);
  const quiz = buildFamilyQuiz("空");
  assert.ok(quiz?.choices.some((c) => c.label === "クウ" && c.correct));
  assert.ok(quiz?.choices.some((c) => c.label === "コウ"));
  assert.equal(chipsForFamily(familyById("sei_ao")!).includes("セイ"), true);
  assert.equal(getGradeParams(1).phonetic_family_enabled, false);
  assert.equal(getGradeParams(3).phonetic_family_enabled, true);
});

test("W6.4 teach_ready and dual-echo rules untouched", () => {
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
  assert.equal(PHONETIC_FAMILIES.length >= 3, true);
});
