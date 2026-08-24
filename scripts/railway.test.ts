import assert from "node:assert/strict";
import { test } from "node:test";
import { CONFUSABLE_PAIRS } from "../src/data/confusable.ts";
import { buildConfusableQuiz, pairFor, pairPlayable } from "../src/lib/confusable.ts";
import { getConfusableItem, gradeChoice } from "../src/lib/items.ts";
import { emptyProgress } from "../src/lib/progress-eval.ts";
import { justReachedPerfect, mergeStamp, stampFromPerfect } from "../src/lib/stamps.ts";

test("fifteen editorial confusable pairs; G1 can play 右/石 and not 未/末", () => {
  assert.equal(CONFUSABLE_PAIRS.length >= 15, true);
  assert.ok(pairFor("右"));
  assert.equal(pairFor("右")?.b, "石");
  assert.ok(pairFor("未"));
  assert.ok(pairFor("貝"));
  assert.equal(pairPlayable(pairFor("右")!, 1), true);
  assert.equal(pairPlayable(pairFor("未")!, 1), false);
  assert.equal(pairPlayable(pairFor("未")!, 4), true);
});

test("confusable item grades as shape and is published", () => {
  const item = getConfusableItem("右");
  assert.ok(item);
  assert.equal(item.kind, "shape");
  assert.equal(item.status, "published");
  assert.ok(item.payload.confusable);
  const right = item.payload.choices.find((c) => c.correct)!;
  const wrong = item.payload.choices.find((c) => !c.correct)!;
  assert.equal(gradeChoice(item, right.id).correct, true);
  assert.equal(gradeChoice(item, wrong.id).correct, false);
  assert.equal(wrong.label, "石");
});

test("buildConfusableQuiz prompt follows the studied character", () => {
  const 右 = buildConfusableQuiz("右");
  const 石 = buildConfusableQuiz("石");
  assert.ok(右?.prompt.includes("右"));
  assert.ok(石?.prompt.includes("石"));
});

test("stamp awarded once on first perfect; decay does not duplicate or drop", () => {
  const first = {
    ...emptyProgress("一"),
    status: "perfect" as const,
    perfectAt: "2026-08-20T00:00:00.000Z",
  };
  const stamp = stampFromPerfect(first);
  assert.equal(stamp.kanji, "一");
  let book = mergeStamp([], stamp);
  book = mergeStamp(book, stamp);
  assert.equal(book.length, 1);
  const prev = emptyProgress("一");
  prev.status = "almost";
  assert.equal(justReachedPerfect(prev, first), true);
  assert.equal(justReachedPerfect(first, first), false);
  const decayed = { ...first, status: "almost" as const };
  assert.equal(justReachedPerfect(first, decayed), false);
  book = mergeStamp(book, stampFromPerfect(decayed));
  assert.equal(book.length, 1);
});
