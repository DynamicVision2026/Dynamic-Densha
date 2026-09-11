import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FAST_INTERVAL_MS,
  FAST_WINDOW_MS,
  POLL_CEILING_MS,
  SLOW_INTERVAL_MS,
  pollIntervalMs,
  successView,
} from "../src/lib/checkout-poll.ts";
import {
  CORPORATE_NAME,
  DEFAULT_TRAIN_NAME,
  PLAN_PRICE_JPY,
  STATEMENT_DESCRIPTOR,
  trainNameOrDefault,
} from "../src/lib/commerce-copy.ts";
import { detectInstallPlatform, isStandaloneDisplay } from "../src/lib/install-platform.ts";
import { commuterPassPlainText } from "../src/lib/ticket-png.ts";
import { PASS_QR_HREF } from "../src/lib/ticket-qr.ts";

/**
 * Source with comments stripped. Every "this must NOT appear" assertion
 * below runs against this rather than the raw file -- otherwise a comment
 * explaining why something is absent (`no dashed perforation`, `not a
 * screenshot`) trips the very check that enforces it.
 */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ---------- polling schedule (spec §1.3) ----------

test("polls every 2s inside the fast window, every 10s after it, and stops at five minutes", () => {
  assert.equal(pollIntervalMs({ active: false, elapsedMs: 0 }), FAST_INTERVAL_MS);
  assert.equal(pollIntervalMs({ active: false, elapsedMs: FAST_WINDOW_MS - 1 }), FAST_INTERVAL_MS);
  assert.equal(pollIntervalMs({ active: false, elapsedMs: FAST_WINDOW_MS }), SLOW_INTERVAL_MS);
  assert.equal(pollIntervalMs({ active: false, elapsedMs: POLL_CEILING_MS - 1 }), SLOW_INTERVAL_MS);
  assert.equal(pollIntervalMs({ active: false, elapsedMs: POLL_CEILING_MS }), false);
});

test("polling stops the moment entitlement lands, at any elapsed time", () => {
  for (const elapsedMs of [0, 10_000, FAST_WINDOW_MS, POLL_CEILING_MS * 2]) {
    assert.equal(pollIntervalMs({ active: true, elapsedMs }), false);
  }
});

test("the window is wider than the dashboard's own 30s poll -- PayPay may only settle later", () => {
  assert.ok(POLL_CEILING_MS > 30_000);
  assert.equal(POLL_CEILING_MS, 300_000);
});

test("three states, and confirmed wins over elapsed time however late it arrives", () => {
  assert.equal(successView({ active: false, elapsedMs: 0 }), "pending");
  assert.equal(successView({ active: false, elapsedMs: FAST_WINDOW_MS - 1 }), "pending");
  assert.equal(successView({ active: false, elapsedMs: FAST_WINDOW_MS }), "slow");
  assert.equal(successView({ active: false, elapsedMs: POLL_CEILING_MS * 10 }), "slow");
  assert.equal(successView({ active: true, elapsedMs: 0 }), "confirmed");
  assert.equal(successView({ active: true, elapsedMs: POLL_CEILING_MS * 10 }), "confirmed");
});

test("the slow state starts at the fast window, while polling quietly continues behind it", () => {
  // A pass that lands at 90s must still appear on its own -- the slow copy
  // is not a dead end, it is an explanation.
  const elapsed = 90_000;
  assert.equal(successView({ active: false, elapsedMs: elapsed }), "slow");
  assert.equal(pollIntervalMs({ active: false, elapsedMs: elapsed }), SLOW_INTERVAL_MS);
});

// ---------- fixed commerce copy (spec §0.3) ----------

test("the statement descriptor is exactly what a bank will show, and is not localised", () => {
  assert.equal(STATEMENT_DESCRIPTOR, "SP BC-KANJIDENSHA");
  const src = readFileSync("src/lib/commerce-copy.ts", "utf8");
  assert.equal(/useI18n|MessageKey/.test(src), false);
});

test("prices live in one place, and the plan cards read from it rather than repeating themselves", () => {
  assert.equal(PLAN_PRICE_JPY.buyout, "¥9,800");
  assert.equal(PLAN_PRICE_JPY.annual, "¥3,800");
  const ticket = readFileSync("src/components/ticket.tsx", "utf8");
  assert.match(ticket, /PLAN_PRICE_JPY/);
});

test("the corporate notice names the entity behind the charge", () => {
  assert.match(CORPORATE_NAME, /Beyond Culture/);
  assert.match(CORPORATE_NAME, /獨歩文化株式会社/);
});

// ---------- the pass carries a train name, never a child (spec §0.2) ----------

test("an unset train name falls back to わたしのれっしゃ号", () => {
  assert.equal(trainNameOrDefault(null), DEFAULT_TRAIN_NAME);
  assert.equal(trainNameOrDefault(undefined), DEFAULT_TRAIN_NAME);
  assert.equal(trainNameOrDefault("   "), DEFAULT_TRAIN_NAME);
  assert.equal(trainNameOrDefault("はやぶさ号"), "はやぶさ号");
  assert.equal(trainNameOrDefault("  のぞみ号  "), "のぞみ号");
});

test("everything the saveable pass can contain is declarable, and none of it is identity", () => {
  const text = commuterPassPlainText({
    passenger: trainNameOrDefault(null),
    planLabel: "ご家庭ライセンス",
    validityLabel: "なし（永年）",
    title: "定期券",
    validityCaption: "有効期限",
  });
  assert.match(text, /わたしのれっしゃ号/);
  assert.match(text, /獨歩文化株式会社/);
  assert.ok(text.includes(PASS_QR_HREF));
  assert.equal(/childId|userId|nickname|childName|\bemail\b|そら/.test(text), false);
});

test("the pass QR is the plain app URL, with no credential of any kind", () => {
  assert.equal(PASS_QR_HREF, "https://app.kanji-ai.jp/");
  assert.equal(/[?#]/.test(PASS_QR_HREF), false);
});

test("the success route hands the canvas a train name, never a child name", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  assert.match(src, /passenger: trainNameOrDefault\(/);
  assert.equal(/childName|child\.name|nickname/.test(codeOf("src/routes/subscribe.success.tsx")), false);
  assert.equal(/childId|userId|nickname|childName|\bemail\b/.test(codeOf("src/lib/ticket-png.ts")), false);
});

test("the pass is never generated or downloaded on its own -- only from a tap", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  assert.match(src, /onClick=\{\(\) => \{\s*void saveCommuterPassPng\(/);
  // No effect-driven or render-time save.
  assert.equal(/useEffect\([^)]*saveCommuterPassPng/s.test(codeOf("src/routes/subscribe.success.tsx")), false);
});

// ---------- entitlement stays webhook-only (spec §1.3) ----------

test("/subscribe/success reads entitlement and never grants it", () => {
  const route = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  assert.match(route, /getPassState/);
  // No writes to the billing log or the derived row from this path.
  for (const path of ["src/routes/subscribe.success.tsx", "src/lib/server/pass.ts"]) {
    assert.equal(/insert into billing_event|update subscription set/i.test(codeOf(path)), false);
  }
  // pass.ts gained assignAnnualPass, which appends ONE admin_action row so
  // support can answer "who held the pass in March". admin_action is an
  // input to the derivation, so this clause is narrow rather than absent:
  // the only type it may write is pass_reassigned, and the fold below is
  // what proves that type grants nothing. A `trial_extended` written from
  // here would be a real entitlement grant and this would catch it.
  const passSrc = codeOf("src/lib/server/pass.ts");
  const adminWrites = passSrc.match(/insert into admin_action[\s\S]*?`/g) ?? [];
  assert.equal(adminWrites.length, 1, "exactly one admin_action write in pass.ts");
  assert.match(adminWrites[0]!, /'pass_reassigned'/);
  assert.equal(/trial_extended/.test(passSrc), false);
  assert.equal(/subscribe\.success/.test("src/routes/subscribe.success.tsx") && /admin_action/.test(codeOf("src/routes/subscribe.success.tsx")), false);
});

test("the three states are all reachable from the route, and there is no error state", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  assert.match(src, /data-success-view=\{view\}/);
  assert.match(src, /successView\(/);
  assert.match(src, /checkoutPendingTitle/);
  assert.match(src, /checkoutTimeoutTitle/);
  assert.match(src, /successSlowReload/);
});

test("a signed-out visitor opening the email link days later comes back here, not to the dashboard", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  assert.match(src, /RedirectToSignIn/);
  assert.match(src, /%2Fsubscribe%2Fsuccess|\/subscribe\/success/);
});

// ---------- ticket motif (spec §2) ----------

test("the ticket family has punch notches, no dashed perforation, and square corners", () => {
  const src = readFileSync("src/components/ticket.tsx", "utf8");
  const code = codeOf("src/components/ticket.tsx");
  assert.match(src, /rounded-full bg-bg/); // the notches
  assert.equal(/border-dashed|dashed/.test(code), false);
  // No corner rounding on the ticket body itself.
  assert.equal(/className=\{cn\(\s*"relative[^"]*rounded-(sm|md|lg|xl)/.test(src), false);
});

test("/handoff shows plan, price, non-renewal, issuer and descriptor before it hands off", () => {
  const src = readFileSync("src/routes/handoff.tsx", "utf8");
  assert.match(src, /<OutboundTicket plan=/);
  assert.match(src, /<StatementNotice \/>/);
  assert.match(src, /checkoutCta/);
  assert.match(src, /tokushoho/);
  // The auto-redirect is gone: a two-second timer to a third-party origin
  // defeats the point of putting the terms on this screen at all.
  assert.equal(/setTimeout\([^)]*window\.location/s.test(codeOf("src/routes/handoff.tsx")), false);
});

test("the arrival pass shows validity per plan and stamps it", () => {
  const src = readFileSync("src/components/ticket.tsx", "utf8");
  assert.match(src, /passValidityForever/);
  assert.match(src, /dateWithYearLabel/); // the annual pass's real date, with its year
  assert.match(src, /data-pass-stamp/);
  assert.match(src, /passStamp/);
});

test("riding is the primary CTA and the parent dashboard is secondary", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  const ride = src.indexOf('href="/app"');
  const parent = src.indexOf('href="/app/parent"');
  assert.ok(ride > -1 && parent > -1);
  assert.ok(ride < parent, "the ride CTA must come first");
  // Only the ride button is vermilion.
  assert.match(src, /data-ride-cta[\s\S]{0,200}bg-primary/);
});

// ---------- PWA (spec §3) ----------

test("the install guide sits below the CTAs, never above them", () => {
  const src = readFileSync("src/routes/subscribe.success.tsx", "utf8");
  const ride = src.indexOf("data-ride-cta");
  const guide = src.indexOf("<InstallGuide />");
  assert.ok(ride > -1 && guide > -1);
  assert.ok(ride < guide, "riding comes first");
});

test("platform detection picks the right instructions, including iPadOS pretending to be a Mac", () => {
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "ios");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), "other");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "android");
  assert.equal(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "other");
  assert.equal(detectInstallPlatform(""), "other");
});

test("the guide hides itself once the app is already running from the home screen", () => {
  assert.equal(isStandaloneDisplay({ displayModeStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false }), false);
  assert.equal(isStandaloneDisplay({ displayModeStandalone: false }), false);
});

test("iOS gets drawn instructions, not a screenshot and not a button that cannot exist there", () => {
  const src = readFileSync("src/components/install-guide.tsx", "utf8");
  assert.match(src, /<svg/); // the Share glyph is drawn
  assert.equal(/<img|\.png|\.jpg|screenshot/i.test(codeOf("src/components/install-guide.tsx")), false);
  assert.match(src, /beforeinstallprompt/); // used where it actually fires
});

test("the manifest opens the child's board, not the door", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  assert.equal(manifest.start_url, "/app");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.name, "漢字でんしゃ");
  assert.equal(manifest.short_name, "でんしゃ");
  assert.equal(manifest.theme_color, "#F4EFE4");
  assert.equal(manifest.background_color, "#F4EFE4");
});

test("every icon the manifest promises actually exists, including a maskable one", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes("192x192"));
  assert.ok(sizes.includes("512x512"));
  assert.ok(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"));
  for (const icon of manifest.icons as Array<{ src: string }>) {
    assert.ok(existsSync(`public${icon.src}`), `${icon.src} is referenced but missing`);
  }
  assert.ok(existsSync("public/icon-180.png"), "apple-touch-icon is missing");
});

test("the head points at the app's own manifest and icon, not the preview host's", () => {
  const src = readFileSync("src/routes/__root.tsx", "utf8");
  assert.match(src, /rel: "manifest", href: "\/manifest\.webmanifest"/);
  assert.match(src, /rel: "apple-touch-icon", sizes: "180x180", href: "\/icon-180\.png"/);
  assert.match(src, /apple-mobile-web-app-title/);
  assert.equal(/__grok\/manifest|__grok\/icon/.test(codeOf("src/routes/__root.tsx")), false);
});
