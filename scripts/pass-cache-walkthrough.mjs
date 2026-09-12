/**
 * Does moving the annual pass reach an already-open child board without a
 * reload?
 *
 * Reported as "caches are not invalidated on assignment". They are -- this
 * script is what established that, in both directions and with no reload,
 * and the report turned out to be two same-named siblings being mistaken for
 * one another (see src/lib/child-labels.ts). Kept because the claim is worth
 * re-checking whenever the query keys move, and because the earlier
 * multi-child walkthrough could not have caught it: that one navigated with
 * page.goto(), a full page load, which bypasses the query cache entirely.
 *
 * The reported path exactly: assign the pass in settings, then reach the
 * covered child's board by IN-APP navigation, not a reload. The earlier
 * multi-child walkthrough used page.goto() -- a full page load -- which
 * bypasses the query cache entirely and so never tested this at all.
 */
import { chromium } from "playwright";
import { signInWithNewAccount } from "./walkthrough-session.mjs";
import { createHmac } from "node:crypto";
const BASE = "http://localhost:8080", SECRET = "test-secret";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await b.newPage();
page.on("dialog", (d) => d.accept());

const childA = await signInWithNewAccount(page, BASE, { childName: "たろう" });
await page.goto(`${BASE}/onboard?add=1`);
await page.waitForSelector("#child-name", { timeout: 20000 });
await page.fill("#child-name", "はなこ");
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 20000 }).catch(() => {});

// annual pass
await page.goto(`${BASE}/handoff?plan=annual`);
await page.waitForSelector("[data-checkout-cta]", { timeout: 20000 });
const token = new URL(await page.getAttribute("[data-checkout-cta]", "href")).searchParams.get("attributes[kd_token]");
const raw = JSON.stringify({ id: 9, name: "#9", line_items: [{ variant_id: 222 }], note_attributes: [{ name: "kd_token", value: token }] });
const hmac = createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");
await page.evaluate(async ([u, raw, hmac]) => fetch(u, { method: "POST", headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac, "x-shopify-topic": "orders/paid", "x-shopify-webhook-id": "w9" }, body: raw }),
  [`${BASE}/api/webhooks/shopify`, raw, hmac]);

// Find childB, then WARM ITS BOARD while the pass is unassigned -- at which
// point it is rideable, because an unassigned annual pass covers everyone.
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector("[data-pass-choose]", { timeout: 20000 });
const childB = await page.evaluate((a) => {
  const el = [...document.querySelectorAll("[data-pass-choose]")].find((n) => n.getAttribute("data-pass-choose") !== a);
  return el?.getAttribute("data-pass-choose") ?? null;
}, childA);

await page.goto(`${BASE}/app/child/${childB}`);
await page.waitForSelector("[data-child-switcher], [data-child-stage]", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const warm = await page.content();
ok(!warm.includes("いまは のれません"), "childB rides while the pass is unassigned (its cache is now warm and says: rideable)");

// Assign the pass to childA. childB must LOSE the ability to ride.
await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector(`[data-pass-choose="${childA}"]`, { timeout: 20000 });
await page.click(`[data-pass-choose="${childA}"]`);
await page.waitForSelector("[data-pass-assignment]:not([data-pass-unassigned])", { timeout: 20000 });

// IN-APP navigation to childB's board: a switcher tap, not a reload.
await page.click('[data-parent-tab="report"]');
await page.waitForURL(/\/app\/parent\/report\//, { timeout: 20000 });
await page.click("[data-mastery-open-map]");
await page.waitForURL(/\/app\/child\//, { timeout: 20000 });
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
await page.click(`[data-child-switch="${childB}"]`);
await page.waitForURL(new RegExp(childB), { timeout: 20000 });
await page.waitForTimeout(2500);

const afterHtml = await page.content();
ok(afterHtml.includes("いまは のれません"),
   "childB is locked out IMMEDIATELY after the pass moves to childA, with no reload");

// And the covered child rides, same navigation style.
await page.click(`[data-child-switch="${childA}"]`);
await page.waitForURL(new RegExp(childA), { timeout: 20000 });
await page.waitForTimeout(2000);
ok(!(await page.content()).includes("いまは のれません"),
   "and childA rides immediately, with no reload");

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nno stale-cache bug reproduced");
process.exit(fails.length ? 1 : 0);
