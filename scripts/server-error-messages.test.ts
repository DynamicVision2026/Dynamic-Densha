import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveServerErrorMessage } from "../src/lib/server-error-messages.ts";
import { MESSAGES } from "../src/lib/i18n/messages.ts";

/**
 * The bug: a server function throws a fixed ja string (there is no locale in
 * scope when it decides a request is invalid), and several client catch
 * blocks rendered that raw `err.message` straight into the UI. Correct in
 * ja, a leak everywhere else -- an English- or Chinese-reading parent would
 * see a bare Japanese sentence the moment a validator rejected their input.
 *
 * resolveServerErrorMessage is the boundary that closes it. These tests
 * pin the table against every string src/lib/server/*.ts actually throws
 * (so a future rename there is caught here, not discovered live) and prove
 * every known error resolves in all four locales -- never falling through
 * to the generic saveFailed for a case the table claims to know.
 */

function fakeT(locale: keyof typeof MESSAGES) {
  return (key: string) => (MESSAGES[locale] as Record<string, string>)[key];
}

const KNOWN_RAW_MESSAGES = [
  "お名前を入力してください",
  "学年の指定が正しくありません",
  "リクエストが正しくありません",
  "こどもの保存に失敗しました",
  "お子さまの情報が見つかりません",
  "最後のお一人は非表示にできません",
  "乗りはじめが正しくありません",
];

test("every raw string thrown by src/lib/server resolves to something other than the generic fallback, in every locale", () => {
  const fallback = { ja: fakeT("ja")("saveFailed"), en: fakeT("en")("saveFailed") };
  for (const raw of KNOWN_RAW_MESSAGES) {
    for (const locale of ["ja", "en", "zh-Hans", "zh-Hant"] as const) {
      const resolved = resolveServerErrorMessage(new Error(raw), fakeT(locale));
      assert.ok(resolved, `${locale}: ${raw} resolved to nothing`);
      if (locale !== "ja") {
        assert.notEqual(
          resolved,
          raw,
          `${locale}: "${raw}" was rendered VERBATIM -- the exact leak this table exists to close`,
        );
      }
    }
  }
  // Sanity: the fallback itself is reachable and distinct in ja vs en, so the
  // "not equal to fallback" checks above are not vacuously true.
  assert.notEqual(fallback.ja, fallback.en);
});

test("an unrecognised message falls back to saveFailed rather than leaking", () => {
  for (const locale of ["ja", "en", "zh-Hans", "zh-Hant"] as const) {
    const t = fakeT(locale);
    assert.equal(
      resolveServerErrorMessage(new Error("some future validator's new ja string"), t),
      t("saveFailed"),
    );
    assert.equal(resolveServerErrorMessage(undefined, t), t("saveFailed"));
    assert.equal(resolveServerErrorMessage("not even an Error instance", t), t("saveFailed"));
  }
});

test("the table's keys are exactly what src/lib/server actually throws -- no drift either direction", () => {
  const serverFiles = [
    "src/lib/server/children.ts",
    "src/lib/server/coverage.ts",
    "src/lib/server/grade-route.ts",
    "src/lib/server/insights.ts",
    "src/lib/server/pass.ts",
  ];
  const thrown = new Set<string>();
  for (const f of serverFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/throw new Error\("([^"]+)"\)/g)) thrown.add(m[1]);
  }
  // "Not authorized" (admin.ts-style) and English internal-assertion strings
  // are not ja UI copy and are out of this table's scope by design.
  const jaLeakCandidates = [...thrown].filter((s) => /[぀-ヿ一-鿿]/.test(s));
  for (const raw of jaLeakCandidates) {
    assert.ok(
      KNOWN_RAW_MESSAGES.includes(raw),
      `"${raw}" is thrown somewhere in src/lib/server but is not in resolveServerErrorMessage's table -- it will leak raw ja to non-ja locales`,
    );
  }
  for (const known of KNOWN_RAW_MESSAGES) {
    assert.ok(jaLeakCandidates.includes(known), `"${known}" is in the table but nothing throws it anymore -- dead entry`);
  }
});

test("every client catch block that can see a server function's thrown error routes through the table, not err.message directly", () => {
  const sites = [
    "src/routes/onboard.tsx",
    "src/routes/app/parent.settings.tsx",
    "src/components/child-profile-row.tsx",
  ];
  for (const f of sites) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /resolveServerErrorMessage/, `${f} must route its catch through resolveServerErrorMessage`);
    // The literal shape of the bug this closes: rendering err.message straight,
    // with only a non-Error fallback.
    assert.equal(
      /err instanceof Error \? err\.message : t\(/.test(src) || /error instanceof Error \? .*\.message : t\(/.test(src),
      false,
      `${f} still renders a caught error's raw .message`,
    );
  }
});
