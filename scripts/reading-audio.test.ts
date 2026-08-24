import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { collectTeachableReadings, readingAudioKey, readingAudioUrl, lookupReadingAudio } from "../src/data/reading-audio.ts";
import { getKanji } from "../src/data/kyoiku.ts";

test("S2/S3 same display string always maps to the same key and URL", () => {
  const a = lookupReadingAudio("やま");
  const b = lookupReadingAudio("やま");
  assert.ok(a && b);
  assert.equal(a.key, b.key);
  assert.equal(a.url, b.url);
  assert.equal(a.text, "やま");
  assert.equal(readingAudioKey("サン"), readingAudioKey("サン"));
  assert.equal(readingAudioUrl("サン"), readingAudioUrl("サン"));
});

test("山 わかる readings are elementary 音 and 訓", () => {
  const k = getKanji("山");
  assert.ok(k);
  assert.ok(k.elementaryReadings.onyomi.includes("サン"));
  assert.ok(k.elementaryReadings.kunyomi.includes("やま"));
  assert.equal(lookupReadingAudio("サン")?.text, "サン");
  assert.equal(lookupReadingAudio("やま")?.text, "やま");
  assert.notEqual(readingAudioUrl("サン"), readingAudioUrl("やま"));
});

test("G1 teachable set is unique by exact UI string", () => {
  const rows = collectTeachableReadings(1);
  const texts = rows.map((r) => r.text);
  assert.equal(new Set(texts).size, texts.length);
  assert.ok(rows.length > 80);
  assert.ok(rows.every((r) => r.url.startsWith("/audio/readings/") && r.url.endsWith(".mp3")));
});

test("missing clip does not invent another reading URL", () => {
  const yama = readingAudioUrl("やま");
  const fake = readingAudioUrl("みず");
  assert.ok(yama && fake);
  assert.notEqual(yama, fake);
});

test("baked 山 clips exist", () => {
  const yama = readingAudioUrl("やま");
  const san = readingAudioUrl("サン");
  assert.ok(yama && san);
  assert.equal(existsSync(new URL(`../public${yama}`, import.meta.url)), true);
  assert.equal(existsSync(new URL(`../public${san}`, import.meta.url)), true);
});
