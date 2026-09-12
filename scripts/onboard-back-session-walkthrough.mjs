import { chromium, devices } from "playwright";
import { createHmac } from "node:crypto";
import { signUpFresh, signInExisting } from "./walkthrough-session.mjs";

/**
 * Two QA reports, driven in a browser.
 *
 * 1. もどる on /onboard?add=1 threw a signed-in parent out to /demo. AppShell
 *    derived the back target from the path alone and defaulted anything that
 *    was neither /app… nor /demo… to the marketing tour -- and /onboard is the
 *    only route in that position. A parent who tapped 「＋ 追加」 and changed
 *    their mind left the app.
 *
 * 2. "logging in with an existing parent email drops the session and serves a
 *    guest free-trial state (0/3 children, order —)". This drives exactly that:
 *    a household with a child and a paid order, signed out, signed back in with
 *    the same email, and then asked whether it is still the same household --
 *    across a reload and a second tab as well, since a cookie that survives one
 *    but not the other is the shape a real session bug would take.
 *
 * MUST run against a dev server with auth CONFIGURED, or half of it is
 * vacuous: with no auth provider env, requireUserId() resolves the shared
 * dev user and every server function ignores the session altogether, so
 * "signing back in keeps the household" would pass no matter what the session
 * did. Fake Google credentials are enough -- email/password sign-in never
 * touches Google, it just needs authConfigured to be true:
 *
 *   GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test \
 *   SHOPIFY_STORE_DOMAIN=shop.example.test SHOPIFY_VARIANT_BUYOUT=111 \
 *   SHOPIFY_VARIANT_ANNUAL=222 SHOPIFY_WEBHOOK_SECRET=test-secret npm run dev
 *
 * It refuses to run otherwise rather than reporting a false pass.
 */

const BASE = "http://localhost:8080";
const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "test-secret";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

// Refuse to run vacuously: a shared dev user has no `user` row, so the email
// the account block shows would be "—" and no session assertion below would
// mean anything.
await page.goto(`${BASE}/login`);
await page.waitForLoadState("networkidle");
const authReal = await page.evaluate(() => !/ご利用いただけません|not available|无法使用|無法使用/.test(document.body.textContent ?? ""));
if (!authReal) {
  console.log("SKIP  auth is not configured on this dev server -- see the header comment");
  await b.close();
  process.exit(2);
}

const creds = await signUpFresh(page, BASE);

// ── 1. the first run has nowhere to go back TO ───────────────────────────
// /app redirects a childless household straight back here, so a もどる that
// pointed at it would be a link to the page you are already on. It is absent
// rather than pointing at /demo, which is what the report was about.
ok(page.url().includes("/onboard"), `a childless parent lands on the form: ${new URL(page.url()).pathname}`);
await page.waitForSelector("#child-name", { timeout: 20000 });
const firstRunBack = await page.$("[data-shell-back]");
ok(!firstRunBack, "no もどる on a first run -- /app would bounce straight back here");

await page.fill("#child-name", "たろう");
await page.click('button[type="submit"]');
await page.waitForURL(/\/app\/child\//, { timeout: 20000 });

// ── 2. the reported path: settings -> ＋追加 -> もどる ────────────────────
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector("[data-add-child]", { timeout: 20000 });
await page.click("[data-add-child]");
await page.waitForURL(/\/onboard/, { timeout: 20000 });
ok(/add=(1|true)/.test(page.url()), `＋追加 reaches the form deliberately: ${page.url()}`);

await page.waitForSelector("[data-shell-back]", { timeout: 20000 });
const backTo = await page.getAttribute("[data-shell-back]", "data-shell-back");
ok(backTo === "/app/parent/settings", `もどる points back where the parent came from: ${backTo}`);
ok(backTo !== "/demo", "and never at the marketing demo");

await page.click("[data-shell-back]");
await page.waitForURL(/\/app\/parent\/settings/, { timeout: 20000 });
ok(
  new URL(page.url()).pathname === "/app/parent/settings",
  `tapping it returns to the settings hub: ${new URL(page.url()).pathname}`,
);
await page.waitForSelector("[data-child-row]", { timeout: 20000 });
ok((await page.$$("[data-child-row]")).length === 1, "with the household intact and no child added");

// ── 3. a household worth losing: one child and a paid order ──────────────
await page.goto(`${BASE}/handoff?plan=annual`);
await page.waitForSelector("[data-checkout-cta]", { timeout: 20000 });
const token = new URL(await page.getAttribute("[data-checkout-cta]", "href")).searchParams.get("attributes[kd_token]");
const raw = JSON.stringify({
  id: 1003,
  name: "#1003",
  line_items: [{ variant_id: 222 }],
  note_attributes: [{ name: "kd_token", value: token }],
});
const sig = createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");
const status = await page.evaluate(
  async ([url, body, hmac]) => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-topic": "orders/paid",
        "x-shopify-webhook-id": "w1003",
      },
      body,
    });
    return r.status;
  },
  [`${BASE}/api/webhooks/shopify`, raw, sig],
);
ok(status === 200, `order #1003 lands on this household (${status})`);

// The account block renders immediately with "—" placeholders and fills in
// when the query resolves, so waiting for the ELEMENT reads the placeholder.
// Wait for the data.
const waitForAccount = async (p) => {
  await p.waitForSelector("[data-account-email]", { timeout: 20000 });
  await p.waitForFunction(
    () => (document.querySelector("[data-account-email]")?.textContent ?? "—").trim() !== "—",
    { timeout: 20000 },
  );
};

const readAccount = async () => {
  await page.goto(`${BASE}/app/parent/settings`);
  await waitForAccount(page);
  return {
    order: (await page.textContent("[data-account-order]"))?.trim(),
    count: (await page.textContent("[data-child-count]"))?.trim(),
    email: (await page.textContent("[data-account-email]"))?.trim(),
    rows: (await page.$$("[data-child-row]")).length,
  };
};

const before = await readAccount();
ok(before.order === "#1003", `the order name is shown before signing out: ${before.order}`);
ok(before.email === creds.email, `and the signed-in email is the parent's: ${before.email}`);
ok(before.rows === 1, `and the household has its child: ${before.count}`);

// ── 4. sign out, sign back in with the SAME email ────────────────────────
await page.evaluate(async (base) => {
  await fetch(`${base}/api/auth/sign-out`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
}, BASE);
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForLoadState("networkidle");
ok(page.url().includes("/login"), `signing out really ends the session: ${new URL(page.url()).pathname}`);

await signInExisting(page, BASE, creds);
const after = await readAccount();
ok(after.email === creds.email, `signing back in resolves the same parent: ${after.email}`);
ok(after.order === "#1003", `the same household, with its order: ${after.order} (was ${before.order})`);
ok(after.rows === 1, `and its child, not a fresh 0/3 trial: ${after.count} (was ${before.count})`);

// ── 5. the same session in a reload and a second tab ─────────────────────
await page.reload();
await waitForAccount(page);
ok(
  (await page.textContent("[data-account-order]"))?.trim() === "#1003",
  "the cookie survives a reload",
);
const tab2 = await ctx.newPage();
await tab2.goto(`${BASE}/app/parent/settings`);
await waitForAccount(tab2);
const tab2Order = (await tab2.textContent("[data-account-order]"))?.trim();
const tab2Count = (await tab2.textContent("[data-child-count]"))?.trim();
ok(tab2Order === "#1003", `and a second tab sees the same household: ${tab2Order}`);
ok(!/^0 \//.test(tab2Count ?? ""), `never the anonymous 0/3 state: ${tab2Count}`);

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nもどる comes home, and a returning parent keeps their household");
process.exit(fails.length ? 1 : 0);
