import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCALES, MESSAGES, type MessageKey } from "../src/lib/i18n/messages.ts";

const KANA = /[぀-ヿ]/;

/**
 * zh-Hant.lightsTitle ("音・義・形") is a genuine, deliberate translation —
 * 義 is itself the traditional-Chinese character for "meaning", identical to
 * the Japanese kyūjitai here by coincidence, not because it was left
 * untranslated. Every other coincidental match found by this check turned
 * out to be real translation debt (see the commit that added this test), so
 * this is the one narrowly-named exemption, not a loophole.
 */
const COINCIDENTAL_MATCH = new Set(["zh-Hant.lightsTitle"]);

/**
 * A non-ja locale whose value is byte-identical to ja's AND still contains
 * kana is translation debt masquerading as a translation: someone copied the
 * Japanese placeholder into every locale block instead of localizing it.
 * This is exactly the class of bug that let real buttons (door CTAs, the
 * guest-save prompt) render raw Japanese under English/Chinese.
 */
test("no non-ja locale carries an untranslated (kana-bearing) copy of the ja string", () => {
  const ja = MESSAGES.ja;
  const leaks: string[] = [];
  for (const locale of LOCALES) {
    if (locale === "ja") continue;
    for (const key of Object.keys(ja) as MessageKey[]) {
      if (MESSAGES[locale][key] === ja[key] && KANA.test(ja[key])) {
        const flag = `${locale}.${key}`;
        if (!COINCIDENTAL_MATCH.has(flag)) leaks.push(flag);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test("every parents-route message key is translated and non-empty in every locale", () => {
  const keys: MessageKey[] = [
    "doorParents",
    "brand",
    "parentsIntro1",
    "parentsIntro2",
    "parentsStepsHeading",
    "parentsStep1Title",
    "parentsStep1Body",
    "parentsStep2Title",
    "parentsStep2Body",
    "parentsStep3Title",
    "parentsStep3Body",
    "parentsStep4Title",
    "parentsStep4Body",
    "parentsPaceHeading",
    "parentsPaceBody",
    "parentsVisibleHeading",
    "parentsVisibleBody",
    "parentsDataHeading",
    "parentsDataBody",
    "doorTrustTablet",
    "doorTrustPrice",
    "doorTry",
    "parentsBack",
  ];
  for (const locale of LOCALES) {
    for (const key of keys) {
      assert.ok(MESSAGES[locale][key]?.trim().length > 0, `${locale}.${key}`);
    }
  }
});

test("welcome-door buttons (try/parents/login) are translated per locale", () => {
  for (const key of ["doorTry", "doorParents", "doorLogin"] as MessageKey[]) {
    assert.notEqual(MESSAGES.en[key], MESSAGES.ja[key]);
    assert.notEqual(MESSAGES["zh-Hans"][key], MESSAGES.ja[key]);
    assert.notEqual(MESSAGES["zh-Hant"][key], MESSAGES.ja[key]);
  }
});

test("heroKicker doesn't carry Japan's kana-free ministry name into zh locales", () => {
  // 文部科学省/文部科學省 (MEXT) has zero kana, so the kana-based leak check
  // above can't catch it — it's a Japan-specific institutional name written
  // entirely in kanji a Chinese reader can parse but wouldn't recognize as
  // this. EN already renders it as "MEXT"; zh should too.
  for (const locale of ["zh-Hans", "zh-Hant"] as const) {
    assert.doesNotMatch(MESSAGES[locale].heroKicker, /文部科学省|文部科學省/);
    assert.match(MESSAGES[locale].heroKicker, /MEXT/);
  }
});

test("stubCaption, piecePosition, and speakerListen interpolate per locale", () => {
  for (const locale of LOCALES) {
    assert.match(MESSAGES[locale].stubCaption, /\{heading\}/);
    assert.match(MESSAGES[locale].piecePosition, /\{n\}/);
    assert.match(MESSAGES[locale].piecePosition, /\{label\}/);
    assert.match(MESSAGES[locale].speakerListen, /\{text\}/);
  }
});
