import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildDenshaWelcomeEmail, planNoteFor } from "../src/lib/email/densha-welcome-email.ts";

test("planNoteFor derives the correct, non-hardcoded sentence per plan", () => {
  assert.equal(planNoteFor("buyout"), "買い切り・自動更新はありません");
  assert.equal(planNoteFor("annual"), "1年パス・自動更新はありません");
  assert.notEqual(planNoteFor("buyout"), planNoteFor("annual"));
});

test("customerName present -> passenger line uses it; absent -> falls back to わたしのれっしゃ号", () => {
  const named = buildDenshaWelcomeEmail({
    to: "a@example.com",
    customerName: "山田",
    orderRef: "#1007",
    items: [{ title: "漢字でんしゃ（1年パス）", quantity: 1 }],
    planNote: planNoteFor("annual"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success",
    supportEmail: "info@kanji-ai.jp",
  });
  assert.match(named.html, /山田 様の列車/);
  assert.match(named.text, /山田 様の列車/);

  const anonymous = buildDenshaWelcomeEmail({
    to: "a@example.com",
    customerName: null,
    orderRef: "#1007",
    items: [{ title: "漢字でんしゃ（1年パス）", quantity: 1 }],
    planNote: planNoteFor("annual"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success",
    supportEmail: "info@kanji-ai.jp",
  });
  assert.match(anonymous.html, /わたしのれっしゃ号/);
  assert.doesNotMatch(anonymous.html, /様の列車/);
});

test("planNote renders verbatim -- 1年パス never shows 買い切り", () => {
  const msg = buildDenshaWelcomeEmail({
    to: "a@example.com",
    orderRef: "#1007",
    items: [{ title: "漢字でんしゃ（1年パス）", quantity: 1 }],
    planNote: planNoteFor("annual"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success",
    supportEmail: "info@kanji-ai.jp",
  });
  assert.match(msg.html, /1年パス・自動更新はありません/);
  assert.doesNotMatch(msg.html, /買い切り/);
});

test("accessUrl and supportEmail are passed through, never baked into the file as literals", async () => {
  const msg = buildDenshaWelcomeEmail({
    to: "a@example.com",
    orderRef: "#1007",
    items: [{ title: "漢字でんしゃ（ご家庭ライセンス）", quantity: 1 }],
    planNote: planNoteFor("buyout"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success?x=1",
    supportEmail: "custom-support@example.com",
  });
  assert.match(msg.html, /https:\/\/app\.kanji-ai\.jp\/subscribe\/success\?x=1/);
  assert.match(msg.html, /custom-support@example\.com/);

  const code = await readFile("src/lib/email/densha-welcome-email.ts", "utf8");
  assert.doesNotMatch(code, /["']https:\/\/app\.kanji-ai\.jp\/subscribe\/success["']/, "accessUrl must never be a literal inside this file");
});

test("amount and payment method never appear -- that belongs on the receipt, not here", () => {
  const msg = buildDenshaWelcomeEmail({
    to: "a@example.com",
    orderRef: "#1007",
    items: [{ title: "漢字でんしゃ（1年パス）", quantity: 1 }],
    planNote: planNoteFor("annual"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success",
    supportEmail: "info@kanji-ai.jp",
  });
  assert.doesNotMatch(msg.html, /¥|円|クレジットカード|お支払い方法/);
});

test("multiple items all render", () => {
  const msg = buildDenshaWelcomeEmail({
    to: "a@example.com",
    orderRef: "#1009",
    items: [
      { title: "漢字でんしゃ（1年パス）", quantity: 1 },
      { title: "漢字でんしゃ（追加）", quantity: 2 },
    ],
    planNote: planNoteFor("annual"),
    accessUrl: "https://app.kanji-ai.jp/subscribe/success",
    supportEmail: "info@kanji-ai.jp",
  });
  assert.match(msg.html, /漢字でんしゃ（1年パス）/);
  assert.match(msg.html, /漢字でんしゃ（追加）/);
});
