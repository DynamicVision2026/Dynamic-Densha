import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import {
  collectLearningPackageReadings,
  isBakedReading,
  lookupReadingAudio,
  readingAudioUrl,
} from "../src/data/reading-audio.ts";
import { hasEchoBundle } from "../src/lib/echo-surfaces.ts";
import { elementaryReadingsOf } from "../src/lib/readings.ts";
import { isTeachReady, teachReadyChars } from "../src/lib/teach-ready.ts";

function listed(char: string): string[] {
  const r = elementaryReadingsOf(char);
  return [...r.onyomi, ...r.kunyomi].map((t) => String(t).normalize("NFKC").trim()).filter(Boolean);
}

function fileExists(text: string): boolean {
  const url = readingAudioUrl(text);
  if (!url) return false;
  return existsSync(new URL(`../public${url}`, import.meta.url));
}

function packageChars(grade: number) {
  return KYOIKU.filter((k) => k.grade === grade && (grade === 1 || hasEchoBundle(k.char)));
}

test("G1 80/80 every elementary on/kun has a baked file", () => {
  const chars = packageChars(1);
  assert.equal(chars.length, 80);
  for (const k of chars) {
    const rs = listed(k.char);
    assert.ok(rs.length > 0, k.char);
    for (const t of rs) {
      assert.equal(isBakedReading(t), true, `${k.char} ${t}`);
      assert.equal(fileExists(t), true, `${k.char} ${t} file`);
      assert.equal(lookupReadingAudio(t)?.text, t);
    }
  }
});

test("G2–G6 package characters have full on/kun audio", () => {
  const min: Record<number, number> = { 2: 36, 3: 25, 4: 23, 5: 22, 6: 22 };
  for (const g of [2, 3, 4, 5, 6]) {
    const chars = packageChars(g);
    assert.ok(chars.length >= min[g]!, `G${g} package ${chars.length}`);
    for (const k of chars) {
      for (const t of listed(k.char)) {
        assert.equal(fileExists(t), true, `G${g} ${k.char} ${t}`);
        assert.equal(lookupReadingAudio(t)?.text, t);
      }
    }
  }
});

test("所听即所见: 山 サン/やま, 右 みぎ, G3 悪 わるい", () => {
  assert.equal(lookupReadingAudio("サン")?.text, "サン");
  assert.equal(lookupReadingAudio("やま")?.text, "やま");
  assert.equal(lookupReadingAudio("みぎ")?.text, "みぎ");
  assert.equal(lookupReadingAudio("わるい")?.text, "わるい");
  assert.notEqual(readingAudioUrl("サン"), readingAudioUrl("やま"));
  assert.equal(lookupReadingAudio("サン")?.url, lookupReadingAudio("サン")?.url);
});

test("missing string does not map to another reading", () => {
  assert.equal(lookupReadingAudio(""), null);
  assert.equal(lookupReadingAudio("これはない読み"), null);
  assert.notEqual(readingAudioUrl("サン"), readingAudioUrl("これはない読み"));
});

test("package collect size matches baked files", () => {
  const rows = collectLearningPackageReadings();
  for (const e of rows) {
    assert.equal(fileExists(e.text), true, e.text);
    assert.equal(e.text, lookupReadingAudio(e.text)?.text);
  }
});

test("teach_ready audio holds for G1-all and other package chars", () => {
  assert.equal(teachReadyChars(1).length, 80);
  for (const g of [2, 3, 4, 5, 6]) {
    for (const k of packageChars(g)) {
      assert.equal(isTeachReady(k.char), true, k.char);
    }
  }
});
