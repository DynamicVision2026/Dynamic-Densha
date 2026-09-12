import { chromium, devices } from "playwright";
import { createHmac } from "node:crypto";
import { signInWithNewAccount } from "./walkthrough-session.mjs";

/**
 * Does the ご家庭ライセンス CTA on the pass assignment card actually take the
 * parent anywhere?
 *
 * Reported: it did not. It was a TanStack <Link to="/subscribe">, and
 * /subscribe is a `server: { handlers }` route that renders nothing -- so the
 * router performed a client-side navigation to a route with no component and
 * the parent stayed on the settings page, with no error and no way forward but
 * a manual reload.
 *
 * That is not provable from source alone: the <Link> compiled, typechecked and
 * rendered a perfectly good-looking button. It takes a browser clicking it.
 *
 * Needs the funnel env (a store domain, variant ids, a webhook secret) because
 * the card only exists for a household holding an ANNUAL pass -- an unassigned
 * or buyout household has nothing to assign:
 *
 *   SHOPIFY_STORE_DOMAIN=shop.example.test SHOPIFY_VARIANT_BUYOUT=111 \
 *   SHOPIFY_VARIANT_ANNUAL=222 SHOPIFY_WEBHOOK_SECRET=test-secret npm run dev
 */

const BASE = "http://localhost:8080";
const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "test-secret";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

await signInWithNewAccount(page, BASE, { childName: "たろう" });

// Two children, so the pass has something to choose between.
await page.goto(`${BASE}/onboard?add=1`);
await page.waitForSelector("#child-name", { timeout: 20000 });
await page.fill("#child-name", "はなこ");
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 20000 }).catch(() => {});

// ── an annual pass, via a real signed webhook ────────────────────────────
await page.goto(`${BASE}/handoff?plan=annual`);
await page.waitForSelector("[data-checkout-cta]", { timeout: 20000 });
const token = new URL(await page.getAttribute("[data-checkout-cta]", "href")).searchParams.get("attributes[kd_token]");
ok(Boolean(token), "the handoff ticket carries this household's checkout token");

const raw = JSON.stringify({
  id: 31,
  name: "#31",
  line_items: [{ variant_id: 222 }],
  note_attributes: [{ name: "kd_token", value: token }],
});
const hmac = createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");
const status = await page.evaluate(
  async ([url, body, sig]) => {
    // window.fetch, not page.request: assertSameSiteRequest rejects a scripted
    // cross-site request, and Playwright's request context looks like one.
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": sig,
        "x-shopify-topic": "orders/paid",
        "x-shopify-webhook-id": "w31",
      },
      body,
    });
    return r.status;
  },
  [`${BASE}/api/webhooks/shopify`, raw, hmac],
);
ok(status === 200, `the annual order is accepted by the webhook (${status})`);

// ── the card, and the CTA on it ──────────────────────────────────────────
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector("[data-pass-assignment]", { timeout: 20000 });
ok(true, "an annual household sees the pass assignment card");

const upgrade = await page.$("[data-pass-upgrade]");
ok(Boolean(upgrade), "the ご家庭ライセンス CTA is on it");
const href = await page.getAttribute("[data-pass-upgrade]", "href");
ok(
  href === "/subscribe?plan=buyout",
  `and it is an anchor carrying the plan in the URL: ${href}`,
);

// The actual report: click it and see whether the browser goes anywhere.
const settingsUrl = page.url();
await page.click("[data-pass-upgrade]");
await page.waitForURL((u) => !u.toString().includes("/app/parent/settings"), { timeout: 20000 });
ok(page.url() !== settingsUrl, `the click leaves the settings page: ${new URL(page.url()).pathname}`);
ok(
  new URL(page.url()).pathname === "/handoff",
  `/subscribe resolves the household and forwards to the handoff: ${page.url()}`,
);

// ── and the handoff shows where the money is going before it goes ────────
await page.waitForSelector("[data-checkout-cta]", { timeout: 20000 });
const buyoutHref = await page.getAttribute("[data-checkout-cta]", "href");
const cart = new URL(buyoutHref);
ok(cart.host === "shop.example.test", `the checkout points at the configured store: ${cart.host}`);
ok(cart.pathname === "/cart/111:1", `at the buyout variant, quantity one: ${cart.pathname}`);
ok(
  cart.searchParams.get("attributes[kd_plan]") === "buyout",
  "tagged as the buyout plan for the webhook that will follow",
);
ok(
  Boolean(cart.searchParams.get("attributes[kd_token]")),
  "and carrying the opaque household token, never an id or an email",
);
const body = (await page.textContent("body")) ?? "";
ok(
  body.includes("shop.example.test"),
  "the parent is told which store they are about to be sent to (特商法)",
);
ok(!/@/.test(cart.search), "no email anywhere in the cart attributes");

// ── and once they HOLD the buyout, the guard closes again ────────────────
// The narrowed rule must still refuse the purchase it was written to refuse:
// a buyout covers every child, so there is nothing left to buy.
const buyoutRaw = JSON.stringify({
  id: 32,
  name: "#32",
  line_items: [{ variant_id: 111 }],
  note_attributes: [{ name: "kd_token", value: token }],
});
const buyoutSig = createHmac("sha256", SECRET).update(buyoutRaw, "utf8").digest("base64");
const buyoutStatus = await page.evaluate(
  async ([url, body, sig]) => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": sig,
        "x-shopify-topic": "orders/paid",
        "x-shopify-webhook-id": "w32",
      },
      body,
    });
    return r.status;
  },
  [`${BASE}/api/webhooks/shopify`, buyoutRaw, buyoutSig],
);
ok(buyoutStatus === 200, `the buyout order is accepted by the webhook (${buyoutStatus})`);

await page.goto(`${BASE}/subscribe?plan=buyout`);
await page.waitForLoadState("networkidle");
ok(
  new URL(page.url()).searchParams.get("already") === "active",
  `a buyout household asking for buyout again is refused: ${page.url()}`,
);
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector("[data-settings-plan]", { timeout: 20000 });
ok(
  !(await page.$("[data-pass-assignment]")),
  "and the pass chooser is gone -- a buyout has no one child to choose",
);

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nthe buyout CTA leaves the page and reaches the checkout");
process.exit(fails.length ? 1 : 0);
