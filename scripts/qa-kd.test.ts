import assert from "node:assert/strict";
import { test } from "node:test";
import { getStrokeAssembly } from "../src/data/stroke-assembly.ts";
import {
  STROKE_COMPLETE_ID,
  isNextStroke,
  strokeCandidateName,
} from "../src/lib/stroke-assembly.ts";
import {
  buildPracticeQueue,
  getClozeItem,
  getItem,
  gradeChoice,
} from "../src/lib/items.ts";
import { emptyProgress, evaluateProgress } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import { selectEchoSurface } from "../src/lib/echo-surfaces.ts";
import { lookupReadingAudio } from "../src/data/reading-audio.ts";
import { MESSAGES } from "../src/lib/i18n/messages.ts";

const G1 = getGradeParams(1);
const NOW = "2026-08-23T12:00:00.000Z";

test("KD-001 王 stroke names are unique; order is よこよこたてよこ", () => {
  const 王 = getStrokeAssembly("王");
  assert.ok(王);
  assert.equal(王.strokes.length, 4);
  assert.deepEqual(
    王.strokes.map((s) => s.label),
    ["よこ", "よこ", "たて", "よこ"],
  );
  const names = 王.strokes.map((_, i) => strokeCandidateName(王, i));
  assert.equal(new Set(names).size, 4);
  assert.equal(names[0], "1画目・上のよこ");
  assert.equal(names[1], "2画目・中のよこ");
  assert.equal(names[2], "3画目・たて");
  assert.equal(names[3], "4画目・下のよこ");
  assert.equal(isNextStroke(王, 0, 王.strokes[0]!.id), true);
  assert.equal(isNextStroke(王, 0, 王.strokes[1]!.id), false);
});

test("KD-001 completing 王 strokes is a shape success only", () => {
  const item = getItem("王:shape:0", true);
  assert.ok(item?.payload.strokeAssembly);
  assert.equal(gradeChoice(item, STROKE_COMPLETE_ID).correct, true);
  let s = emptyProgress("王");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "shape",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
    },
    G1,
  );
  assert.equal(s.lights.shape, true);
  assert.equal(s.lights.reading, false);
  assert.equal(s.lights.meaning, false);
  assert.notEqual(s.status, "almost");
  assert.notEqual(s.status, "perfect");
});

test("KD-002 session queue: one item per lamp; 王 shape is strokes not cloze", () => {
  const queue = buildPracticeQueue({
    kanji: "王",
    kinds: ["reading", "meaning", "shape"],
    seed: "qa|王|session",
    maxPerKind: 1,
    maxTotal: 3,
    extras: true,
  });
  const kinds = queue.map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === "reading").length, 1);
  assert.equal(kinds.filter((k) => k === "meaning").length, 1);
  assert.equal(kinds.filter((k) => k === "shape").length, 1);
  const shape = queue.find((i) => i.kind === "shape")!;
  assert.ok(shape.payload.strokeAssembly);
  assert.equal(shape.payload.cloze, undefined);
  assert.ok(getClozeItem("王"));
});

test("KD-002 cloze success lights shape only", () => {
  const cloze = getClozeItem("王")!;
  const right = cloze.payload.choices.find((c) => c.correct)!;
  assert.equal(gradeChoice(cloze, right.id).correct, true);
  let s = emptyProgress("王");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: cloze.kind,
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      gentle: true,
    },
    G1,
  );
  assert.equal(s.lights.shape, true);
  assert.equal(s.lights.reading, false);
  assert.equal(s.lights.meaning, false);
  assert.notEqual(s.status, "almost");
});

test("KD-004 よみ choices for 王 all have listen files", () => {
  const item = getItem("王:reading:0", true)!;
  const labels = item.payload.choices.map((c) => c.label);
  assert.ok(labels.includes("オウ"));
  for (const label of labels) {
    assert.ok(lookupReadingAudio(label), label);
  }
});

test("KD-005 王 いみ is semantic, not a reading pick", () => {
  const item = getItem("王:meaning:0", true)!;
  const right = item.payload.choices.find((c) => c.correct)!;
  assert.equal(right.label, "おうさまの こども");
  const labels = item.payload.choices.map((c) => c.label);
  assert.equal(labels.includes("オウ"), false);
  assert.equal(labels.includes("おうじ"), false);
  assert.ok(labels.includes("まちの 名前"));
});

test("KD-008 product source locale is Japanese", () => {
  assert.equal(MESSAGES.ja.brand, "漢字でんしゃ");
  assert.match(MESSAGES.ja.strokeGuide, /1画目/);
});

test("KD-009 王 echo reading uses a different same-reading word", () => {
  const echo = selectEchoSurface({
    char: "王",
    kind: "reading",
    lastSurfaceId: "王:solo",
    seenIds: ["王:solo"],
  });
  assert.ok(echo);
  assert.notEqual(echo.text, "王");
  assert.equal(echo.reading, "オウ");
  const queue = buildPracticeQueue({
    kanji: "王",
    kinds: ["reading", "meaning", "shape"],
    seed: "qa|echo",
    maxPerKind: 1,
    maxTotal: 3,
    echo: { lastSuccessByKind: { reading: "王:solo" }, seenIds: ["王:solo"] },
  });
  const reading = queue.find((i) => i.kind === "reading");
  assert.ok(reading?.payload.surface);
  assert.notEqual(reading.payload.surface.text, "王");
  assert.equal(reading.payload.surface.reading, "オウ");
});
