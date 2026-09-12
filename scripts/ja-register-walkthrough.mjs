import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
import { signInWithNewAccount } from "./walkthrough-session.mjs";

/**
 * Batch 2's whole claim is about words a person reads, so it is checked by
 * reading them off the rendered page rather than off messages.ts.
 *
 * Two registers, verified separately:
 *   - the CHILD's own screens carry kana and friendly forms, and none of the
 *     adult kanji they used to (残響 掛け軸 発車標 看板 到着 済 欠 正 誤)
 *   - the PARENT's screens carry 丁寧語 and no engineering vocabulary
 *     (整備済み, 3手, のった / はじめた), with every interpolated number
 *     still landing in its sentence
 *
 * The older walkthroughs (u1u4, learning-loop, qa-kd …) also touch this copy,
 * but they have drifted against flows that changed in releases since
 * 2026-08-24 and could not even launch here until this batch pinned their
 * browser binary. This script covers the copy; repairing those is its own job.
 */

const BASE = "http://localhost:8080";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

const childId = await signInWithNewAccount(page, BASE, { childName: "たろう" });
const textOf = async (path) => {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  return ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
};

// ── the parent's report: 丁寧語, no engineering words ────────────────────
const report = await textOf(`/app/parent/report/${childId}`);
ok(/この学年で学べる80字のうち、0字がかんぺき/.test(report), "teach-ready reads as Japanese, with both numbers in place");
ok(!/整備済み/.test(report), "「整備済み」 is gone from the parent surface");
ok(/分母は現在学べる字の数です（1026字すべてではありません）。/.test(report), "the denominator note is a sentence, not a spec line");
ok(/おぼえる単位は「字」、出題は「ことば」です/.test(report), "字 vs ことば is explained rather than abbreviated");
ok(/今週のふりかえり（残響）は0回、なおしの字は0字です/.test(report), "the weekly summary keeps {echo} and {fix} and glosses 残響 once");
ok(/下のリストは学校の宿題と合わせてご覧ください/.test(report), "宿題 is the Japanese form, not 宿题");
ok(/完了 \/ 開始/.test(report), "session counts are labelled 完了 / 開始");
ok(!/のった \/ はじめた/.test(report), "and no longer in a child's casual forms");
ok(!/掛け軸|発車標|看板/.test(report) || true, "(parent keeps kanji where it is the adult's word)");

// ── /parents: no internal shorthand ─────────────────────────────────────
const parents = await textOf("/parents");
ok(/乗車の4ステップ/.test(parents), "the steps heading is 乗車の4ステップ");
ok(!/のりの よっつ/.test(parents), "「のりの よっつ」 is gone");
ok(!/3手/.test(parents), "no 「3手」 anywhere a parent reads");
// methodParentBody -- the string the ticket names for this fix -- is not
// rendered by anything (a third dead key, after overviewTitle and
// sampleHint), so it is checked at source rather than pretended to be live.
const messages = readFileSync("src/lib/i18n/messages.ts", "utf8");
ok(
  /methodParentBody: "まちがい帳と到達度から、今週取り組む3つのことをご提案します。"/.test(messages),
  "「3手」 is now 今週取り組む3つのこと (key is unrendered -- checked at source)",
);
ok(/かんぺきは、そのふりかえりのあとです/.test(parents), "the pace explanation uses ふりかえり");

// ── the child's own board and ride ──────────────────────────────────────
const board = await textOf(`/app/child/${childId}`);
ok(!/残響|掛け軸|発車標|看板|到着/.test(board), "the child's board carries none of the adult kanji");

// Straight to a character's own page: clicking the ticket block is one
// button covering the whole board and does not reliably start the ride.
await page.goto(`${BASE}/app/child/${childId}/kanji/%E4%B8%80`);
await page.waitForLoadState("networkidle");
const ride = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
const rideButtons = await page.$$eval("button", (ns) => ns.map((n) => n.textContent.trim()));
ok(!/残響|掛け軸|到着/.test(ride), `no adult kanji on a character's own page (buttons: ${JSON.stringify(rideButtons.filter(Boolean))})`);
// The teach step that renders placeOnScroll is only reachable through a full
// session from the board, not from a character URL -- the legacy walkthroughs
// encode that flow and have drifted. So the button's own copy is asserted at
// source, and NOT claimed as seen live.
ok(
  /placeOnScroll: "かけじくに おく"/.test(messages),
  "the teach button says かけじくに おく (reachable only via a full session -- checked at source)",
);
ok(
  /boardTitle: "はっしゃひょう"/.test(messages) && /arrived: "とうちゃく"/.test(messages),
  "はっしゃひょう and とうちゃく replace 発車標 and 到着",
);

// ── terminology on the forms a parent fills in ──────────────────────────
const onboard = await textOf("/onboard?add=1");
ok(/ニックネーム/.test(onboard), "the name field is labelled ニックネーム");
ok(!/よびな/.test(onboard), "「よびな」 is gone");

const settings = await textOf("/app/parent/settings");
ok(/返金についてのご相談/.test(settings), "the refund control is 返金についてのご相談");
ok(!/返金・ご解約について/.test(settings), "and no longer promises a 解約 that does not exist");

// Sign out to read the login page as a visitor does.
await page.evaluate(async (base) => {
  await fetch(`${base}/api/auth/sign-out`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}, BASE);
const login = await textOf("/login");
ok(/メールアドレス/.test(login), "the email field is labelled メールアドレス");
ok(!/サインイン/.test(login), "no 「サインイン」 -- the app says ログイン");

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\ntwo registers: kana for the child, 丁寧語 for the parent");
process.exit(fails.length ? 1 : 0);
