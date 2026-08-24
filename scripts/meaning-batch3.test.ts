import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { CLOZE_SELECT } from "../src/data/cloze-select.ts";
import { getClozeItem, getItem, listBankItems, meaningItemIsSurfaceLinked } from "../src/lib/items.ts";
import { hasEchoBundle, isWordSurface, preferredMeaningSurface } from "../src/lib/echo-surfaces.ts";
import { isLegalEchoTransition } from "../src/lib/echo-surfaces.ts";

function packageChars(grade: number) {
  return KYOIKU.filter((k) => k.grade === grade && (grade === 1 || hasEchoBundle(k.char)));
}

test("G1 80/80 published meaning; surface-linked majority", () => {
  const chars = packageChars(1);
  assert.equal(chars.length, 80);
  let linked = 0;
  for (const k of chars) {
    const items = listBankItems(k.char, "meaning").filter((i) => i.status === "published");
    assert.ok(items.length >= 1, k.char);
    if (items.some(meaningItemIsSurfaceLinked)) linked += 1;
  }
  assert.ok(linked / chars.length >= 0.7, `linked ${linked}/80`);
});

test("G2–G6 package 100% published meaning", () => {
  for (const g of [2, 3, 4, 5, 6]) {
    for (const k of packageChars(g)) {
      const items = listBankItems(k.char, "meaning").filter((i) => i.status === "published");
      assert.ok(items.length >= 1, `G${g} ${k.char}`);
    }
  }
});

test("右 meaning uses 右手, not a bare gloss-only prompt", () => {
  const surface = preferredMeaningSurface("右");
  assert.equal(surface?.text, "右手");
  const item = getItem("右:meaning:0", true);
  assert.ok(item);
  assert.equal(item.payload.surface?.text, "右手");
  assert.equal(meaningItemIsSurfaceLinked(item), true);
  const labels = item.payload.choices.map((c) => c.label);
  assert.ok(labels.some((l) => l.includes("みぎ")));
  assert.ok(labels.some((l) => l.includes("ひだり") || l.includes("いし") || l.includes("左")));
  assert.equal(labels.some((l) => l === "みぎ" || l === "ウ" || l === "ユウ"), false);
});

test("G1 犬/大 cloze is playable and is shape light", () => {
  const dog = getClozeItem("犬");
  const big = getClozeItem("大");
  assert.ok(dog && big);
  assert.equal(dog.kind, "shape");
  assert.equal(dog.payload.cloze?.answer, "犬");
  assert.ok(dog.payload.choices.some((c) => c.label === "大"));
  assert.ok(big.payload.choices.some((c) => c.label === "犬"));
  assert.ok(dog.payload.cloze?.frame_ja.includes("___"));
  assert.equal(dog.payload.kind, "shape");
});

test("G1 cloze coverage ≥40; G2–G6 packages ≥50%", () => {
  const g1 = packageChars(1).filter((k) => CLOZE_SELECT[k.char]).length;
  assert.ok(g1 >= 40, `G1 cloze ${g1}`);
  assert.equal(g1, 80);
  const min: Record<number, number> = { 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5, 6: 0.5 };
  for (const g of [2, 3, 4, 5, 6]) {
    const pkg = packageChars(g);
    const n = pkg.filter((k) => CLOZE_SELECT[k.char]).length;
    assert.ok(n / pkg.length >= min[g]!, `G${g} cloze ${n}/${pkg.length}`);
  }
});

test("cloze is absent from echo path constructor (session extra only)", () => {
  const echo = getItem("犬:shape:81", true);
  assert.ok(echo?.payload.cloze);
  assert.equal(echo.kind, "shape");
});

test("meaning wrong does not invent せい→う echo switch", () => {
  assert.equal(isLegalEchoTransition("生", "生:先生", "生:生まれる"), false);
  assert.equal(isWordSurface(preferredMeaningSurface("右")!), true);
});

test("no handwriting fields on cloze payload", () => {
  const item = getClozeItem("犬");
  assert.ok(item);
  assert.equal(item.payload.strokeAssembly, undefined);
  const json = JSON.stringify(item.payload);
  assert.equal(json.includes("handwrit"), false);
  assert.equal(json.includes("ocr"), false);
});
