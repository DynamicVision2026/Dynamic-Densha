import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import {
  echoSurfacesFor,
  hasEchoBundle,
  isLegalEchoTransition,
  selectEchoSurface,
  exampleWordSurfaces,
} from "../src/lib/echo-surfaces.ts";
import { isElementaryReading } from "../src/lib/readings.ts";
import { isTeachReady, teachReadyChars } from "../src/lib/teach-ready.ts";
import { preferredMeaningSurface } from "../src/lib/echo-surfaces.ts";

const MIN: Record<number, number> = { 1: 40, 2: 30, 3: 25, 4: 20, 5: 20, 6: 20 };

test("every published surface reading is elementary", () => {
  for (const k of KYOIKU) {
    for (const s of echoSurfacesFor(k.char)) {
      if (s.id.endsWith(":solo")) continue;
      assert.equal(isElementaryReading(k.char, s.reading), true, `${k.char} ${s.id} ${s.reading}`);
    }
  }
});

test("per-grade minimum surface bundles", () => {
  for (const g of [1, 2, 3, 4, 5, 6]) {
    const n = KYOIKU.filter((k) => k.grade === g && hasEchoBundle(k.char)).length;
    assert.ok(n >= MIN[g]!, `G${g} bundle ${n} < ${MIN[g]}`);
  }
});

test("G1 every character has at least one word surface and dual echo", () => {
  const g1 = KYOIKU.filter((k) => k.grade === 1);
  for (const k of g1) {
    assert.ok(exampleWordSurfaces(k.char).length >= 1, k.char);
    assert.ok(hasEchoBundle(k.char), k.char);
  }
});

test("G1 teach_ready rose from ~18 to full G1", () => {
  const n = teachReadyChars(1).length;
  assert.ok(n > 18, String(n));
  assert.equal(n, 80);
});

test("右 still みぎ, never ユウ from solo", () => {
  const next = selectEchoSurface({ char: "右", kind: "reading", lastSurfaceId: "右:solo" });
  assert.equal(next?.text, "右手");
  assert.equal(next?.reading, "みぎ");
  assert.equal(isLegalEchoTransition("右", "右:solo", "右:左右"), false);
});

test("same_word_new_frame: 林 はやしの なか → はやしを あるく", () => {
  const next = selectEchoSurface({ char: "林", kind: "reading", lastSurfaceId: "林:林の中" });
  assert.ok(next);
  assert.equal(next.reading, "はやし");
  assert.equal(next.text, "林");
  assert.equal(next.kind, "same_word_new_frame");
  assert.ok(next.frame && next.frame !== "はやしの なか");
  assert.equal(isLegalEchoTransition("林", "林:林の中", next.id), true);
});

test("生 生きる next stays いきる (生きている frame or same reading word)", () => {
  const next = selectEchoSurface({ char: "生", kind: "reading", lastSurfaceId: "生:生きる" });
  assert.ok(next);
  assert.equal(next.reading, "いきる");
  assert.notEqual(next.id, "生:solo");
});

test("meaning still prefers 右手", () => {
  assert.equal(preferredMeaningSurface("右")?.text, "右手");
});

test("parent denominator still not 1026", () => {
  assert.ok(teachReadyChars(1).length <= 80);
  assert.notEqual(teachReadyChars(1).length, 1026);
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
});
