import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_ITEM_ID,
  drawPublishedItems,
  getItem,
  gradeChoice,
  listBankItems,
  presentBankItem,
} from "../src/lib/items.ts";
import { shuffle } from "../src/lib/quiz.ts";

test("draft item is never returned on the child path", () => {
  assert.equal(getItem(DRAFT_ITEM_ID, true), null);
  const draft = getItem(DRAFT_ITEM_ID, false);
  assert.ok(draft);
  assert.equal(draft.status, "draft");
});

test("unknown item id is rejected", () => {
  assert.equal(getItem("not-an-item", true), null);
  assert.equal(getItem("王:bogus:0", true), null);
});

test("drawPublishedItems returns only published items", () => {
  const drawn = drawPublishedItems({
    kanji: "王",
    kinds: ["reading", "meaning", "shape"],
    seed: "demo|王|session|2026-08-21",
    maxPerKind: 1,
    maxTotal: 3,
  });
  assert.ok(drawn.length >= 2);
  assert.ok(drawn.every((i) => i.status === "published"));
  assert.ok(drawn.every((i) => i.id !== DRAFT_ITEM_ID));
  assert.ok(drawn.every((i) => i.kanji === "王"));
});

test("listBankItems never includes the draft sentinel", () => {
  for (const kind of ["reading", "meaning", "shape"] as const) {
    const items = listBankItems("一", kind);
    assert.ok(items.every((i) => i.status === "published"));
    assert.ok(items.every((i) => i.id !== DRAFT_ITEM_ID));
  }
});

test("gradeChoice marks the correct published choice", () => {
  const item = getItem("王:reading:0", true);
  assert.ok(item);
  const right = item.payload.choices.find((c) => c.correct);
  const wrong = item.payload.choices.find((c) => !c.correct);
  assert.ok(right && wrong);
  assert.equal(gradeChoice(item, right.id).correct, true);
  assert.equal(gradeChoice(item, wrong.id).correct, false);
});

test("repair redraw excludes last wrong item when inventory >= 2", () => {
  const reading = listBankItems("王", "reading").filter((i) => i.status === "published");
  assert.ok(reading.length >= 2, "王 reading needs ≥2 published items");
  const first = drawPublishedItems({
    kanji: "王",
    kinds: ["reading"],
    seed: "demo|王|reading|0",
    maxPerKind: 1,
    maxTotal: 1,
  });
  assert.equal(first.length, 1);
  assert.equal(first[0]!.status, "published");
  const second = drawPublishedItems({
    kanji: "王",
    kinds: ["reading"],
    seed: "demo|王|reading|1",
    maxPerKind: 1,
    maxTotal: 1,
    excludeIds: [first[0]!.id],
  });
  assert.equal(second.length, 1);
  assert.equal(second[0]!.status, "published");
  assert.notEqual(second[0]!.id, first[0]!.id);
  assert.notEqual(second[0]!.id, DRAFT_ITEM_ID);
});

test("inventory of 1 still redraws the same published item", () => {
  const shape = listBankItems("王", "shape").filter((i) => i.status === "published");
  assert.equal(shape.length, 1);
  const first = drawPublishedItems({
    kanji: "王",
    kinds: ["shape"],
    seed: "demo|王|shape|0",
    maxPerKind: 1,
    maxTotal: 1,
  });
  const again = drawPublishedItems({
    kanji: "王",
    kinds: ["shape"],
    seed: "demo|王|shape|1",
    maxPerKind: 1,
    maxTotal: 1,
    excludeIds: [first[0]!.id],
  });
  assert.equal(again[0]!.id, first[0]!.id);
  assert.equal(again[0]!.status, "published");
});

test("presentBankItem shuffles choice order per seed; never serves draft", () => {
  const item = getItem("王:reading:0", true);
  assert.ok(item);
  const a = presentBankItem(item, "child|王|reading|0");
  assert.equal(a.status, "published");
  const idxA = a.payload.choices.findIndex((c) => c.correct);
  let different = false;
  for (let i = 1; i <= 12; i++) {
    const b = presentBankItem(item, `child|王|reading|${i}`);
    if (b.payload.choices.findIndex((c) => c.correct) !== idxA) {
      different = true;
      break;
    }
  }
  assert.equal(different, true);
  const shuffled = shuffle([0, 1, 2, 3], "repair-1");
  const shuffled2 = shuffle([0, 1, 2, 3], "repair-2");
  assert.notDeepEqual(shuffled, shuffled2);
});
