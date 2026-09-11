/**
 * Live verification of the multi-child model, against a real dev server.
 *
 * The claims here cannot be settled by reading source or by a unit test:
 * they are about what a browser actually does -- which URL it ends up on,
 * what the DOM contains, and what the server does when two requests race.
 * Run with the dev server on :8080 and VITE_AUTH_ENABLED=false (the shared
 * dev user), SHOPIFY_WEBHOOK_SECRET=test-secret, SHOPIFY_VARIANT_ANNUAL=222,
 * SHOPIFY_VARIANT_BUYOUT=111.
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";

const BASE = "http://localhost:8080";
const SECRET = "test-secret";
const fails = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails.push(msg);
};

/** A real, HMAC-signed Shopify delivery -- the only thing that grants entitlement. */
async function shopifyWebhook(page, topic, body, id) {
  const raw = JSON.stringify(body);
  const hmac = createHmac("sha256", SECRET).update(raw, "utf8").digest("base64");
  // page.evaluate + window.fetch, NOT page.request: the isolation guard reads
  // Sec-Fetch-* headers, which Node-side requests do not produce.
  return page.evaluate(
    async ([url, raw, hmac, topic, id]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-hmac-sha256": hmac,
          "x-shopify-topic": topic,
          "x-shopify-webhook-id": id,
        },
        body: raw,
      });
      return { status: res.status, body: await res.text() };
    },
    [`${BASE}/api/webhooks/shopify`, raw, hmac, topic, id],
  );
}

/**
 * Add a child through the real form.
 *
 * Not by calling the server function directly: its URL is a base64 blob of
 * {file, export} that the bundler generates, so an invented one 404s
 * silently and every assertion built on it passes vacuously -- which is
 * exactly what the first version of this script did. Driving the form also
 * happens to test the form.
 */
async function addChild(page, name, { confirmDuplicate = false } = {}) {
  await page.goto(`${BASE}/onboard?add=1`);
  await page.waitForSelector("#child-name", { timeout: 15000 });
  await page.fill("#child-name", name);
  await page.click('button[type="submit"]');
  // Three possible outcomes: created (navigates), a duplicate-name question,
  // or a quota refusal. Wait for whichever lands.
  await page
    .waitForFunction(
      () =>
        !location.pathname.startsWith("/onboard") ||
        document.querySelector("[data-duplicate-name-warning]") ||
        document.querySelector("[data-quota-error]"),
      { timeout: 15000 },
    )
    .catch(() => {});
  if (confirmDuplicate && (await page.$("[data-duplicate-name-warning]"))) {
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 15000 }).catch(() => {});
  }
  return {
    created: !page.url().includes("/onboard"),
    duplicate: Boolean(await page.$("[data-duplicate-name-warning]")),
    quota: Boolean(await page.$("[data-quota-error]")),
  };
}

/** The ids of this household's living children, straight off the parent surface. */
async function childIds(page) {
  await page.goto(`${BASE}/app/parent`);
  await page.waitForSelector("[data-add-child]", { timeout: 15000 });
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-child-chip]")].map((el) => el.getAttribute("data-child-chip")),
  );
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
page.on("dialog", (d) => d.accept()); // the reassignment confirm

// ── 1. onboarding creates the first child and lands on a scoped board ─────
await page.goto(`${BASE}/app`);
await page.waitForLoadState("networkidle");
if (page.url().includes("/onboard")) {
  await page.fill("#child-name", "たろう");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/child\//, { timeout: 15000 });
}
await page.waitForURL(/\/app\/child\//, { timeout: 15000 });
const firstUrl = new URL(page.url());
const childA = firstUrl.pathname.split("/")[3];
ok(/^\/app\/child\/[^/]+$/.test(firstUrl.pathname), `first child board is scoped: ${firstUrl.pathname}`);

// ── 2. a bare /app resolves to that child ────────────────────────────────
await page.goto(`${BASE}/app`);
await page.waitForURL(/\/app\/child\//, { timeout: 15000 });
ok(page.url().includes(childA), "/app resolves via the device hint to the same child");

// ── 3. the pre-scoping paths still work ──────────────────────────────────
await page.goto(`${BASE}/app/catalog`);
await page.waitForURL(/\/app\/child\/.*\/catalog/, { timeout: 15000 });
ok(page.url().includes(`/app/child/${childA}/catalog`), `legacy /app/catalog forwards: ${new URL(page.url()).pathname}`);

// ── 4. an unknown child id bounces instead of 404ing ─────────────────────
await page.goto(`${BASE}/app/child/not-a-real-child`);
await page.waitForURL(/\/app\/child\/(?!not-a-real-child)/, { timeout: 15000 });
ok(page.url().includes(childA), "a stale/guessed child id is redirected, not 404'd");

// ── 5. a second and third child, through the real form ──────────────────
// This script fills a household to its trial cap, so it needs one that is
// not already full. PGLite lives in the dev server's memory and survives
// HMR, so a second run against the same server would "fail" on steps that
// are in fact working.
{
  const existing = await childIds(page);
  if (existing.length !== 1) {
    console.error(
      `\nPRECONDITION: this household already has ${existing.length} children. ` +
        `Restart the dev server (its PGLite database is in memory) and re-run.`,
    );
    process.exit(2);
  }
}
const second = await addChild(page, "はなこ");
ok(second.created, "a second child can be added at all (/onboard?add=1)");

// A duplicate name is a QUESTION, not a refusal.
const dup = await addChild(page, "はなこ");
ok(dup.duplicate && !dup.created, "a duplicate name is refused once, confirmably");
const dupConfirmed = await addChild(page, "はなこ", { confirmDuplicate: true });
ok(dupConfirmed.created, "confirming the duplicate name creates the child");

// ── 6. the trial cap is 3 ────────────────────────────────────────────────
const over = await addChild(page, "よにんめ", { confirmDuplicate: true });
ok(over.quota && !over.created, "the trial caps at 3 children");
const ids = await childIds(page);
ok(ids.length === 3, `the household has exactly 3 living children (${ids.length})`);
const childB = ids.find((id) => id !== childA);

// ── 7. the switcher ──────────────────────────────────────────────────────
await page.goto(`${BASE}/app/child/${childA}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 15000 });
const switches = await page.$$("[data-child-switch]");
ok(switches.length === 3, `the switcher shows every living child (${switches.length})`);
ok((await page.$$("[data-child-switch-current]")).length === 1, "exactly one locomotive is marked current");

// One tap switches. No gate, no confirmation.
await page.click(`[data-child-switch="${childB}"]`);
await page.waitForURL(new RegExp(childB), { timeout: 15000 });
ok(page.url().includes(childB), "one tap on a sibling's locomotive switches board");

// ── 8. the child surface never mentions money, in any state ──────────────
const boardHtml = await page.content();
ok(!/¥|アップグレード|9,800|3,800|1,280/.test(boardHtml), "the child board's DOM contains no price and no upgrade");
ok(!boardHtml.includes("/subscribe"), "and no route into commerce");

// ── 9. cross-household ids are refused ───────────────────────────────────
// A well-formed id from nobody's household: the layout must bounce it, and
// the server must refuse it independently.
const foreignId = crypto.randomUUID();
await page.goto(`${BASE}/app/child/${foreignId}/stamps`);
// Wait for the redirect to actually settle -- the layout can only decide
// once listChildren has answered, so asserting on the URL immediately after
// load tests nothing.
await page.waitForURL((u) => !u.pathname.includes(foreignId), { timeout: 15000 });
ok(!page.url().includes(foreignId), "a foreign child id never renders that child's page");
// /app is an intermediate hop -- it resolves and forwards again, so wait for
// the scoped URL rather than asserting on whatever the first redirect hit.
await page.waitForURL(/\/app\/child\/[^/]+$/, { timeout: 15000 });
ok([childA, childB].some((id) => page.url().includes(id)),
   `and lands on one of the household's own children (${new URL(page.url()).pathname})`);

// ── 10. two devices, two children, no crossed state ──────────────────────
const other = await browser.newContext();
const page2 = await other.newPage();
await page2.goto(`${BASE}/app/child/${childB}`);
await page2.waitForSelector("[data-child-switcher]", { timeout: 15000 });
await page.goto(`${BASE}/app/child/${childA}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 15000 });
ok(page.url().includes(childA) && page2.url().includes(childB),
   "two browsers hold two different children at once -- no shared server-side selection");
// And a reload on each keeps its own child.
await page.reload();
await page2.reload();
await page.waitForSelector("[data-child-switcher]", { timeout: 15000 });
await page2.waitForSelector("[data-child-switcher]", { timeout: 15000 });
ok(page.url().includes(childA) && page2.url().includes(childB), "and each keeps its own child across a reload");
await other.close();

// ── 11. the parent surface, and the assignment card's absence on a trial ─
await page.goto(`${BASE}/app/parent`);
await page.waitForSelector("[data-add-child]", { timeout: 15000 });
ok(!(await page.$("[data-pass-assignment]")), "a trial household is shown no pass assignment card -- there is no pass to assign");

// ── 12. buy an ANNUAL pass, and watch coverage decide who rides ──────────
// The token is the household's own checkout_token, round-tripped through the
// cart permalink -- exactly how a real order carries it back. Read off the
// real CTA rather than invented, so a wrong token fails loudly here instead
// of silently "working".
await page.goto(`${BASE}/handoff?plan=annual`);
await page.waitForSelector("[data-checkout-cta]", { timeout: 20000 });
const checkoutHref = await page.getAttribute("[data-checkout-cta]", "href");
const token = new URL(checkoutHref).searchParams.get("attributes[kd_token]");
ok(Boolean(token), "the checkout link carries the household's own token");

const paid = await shopifyWebhook(
  page,
  "orders/paid",
  {
    id: 90001,
    name: "#1001",
    line_items: [{ variant_id: 222 }],
    note_attributes: [{ name: "kd_token", value: token }],
  },
  `wh-annual-${Date.now()}`,
);
ok(paid.status === 200, `a signed orders/paid for the annual variant is accepted (${paid.status})`);

// ── 13. an unassigned annual pass blocks on the parent surface ───────────
await page.goto(`${BASE}/app/parent`);
await page.waitForSelector("[data-pass-assignment]", { timeout: 20000 });
ok(Boolean(await page.$("[data-pass-unassigned]")), "an unassigned annual pass shows the blocking chooser");
const parentText = await page.textContent("[data-pass-assignment]");
ok(parentText.includes("1年パスをご利用になるお子さまを選んでください"), "with the approved copy");
ok(parentText.includes("ご家庭ライセンス"), "and the buyout as the way to cover everyone");
ok(Boolean(await page.$("[data-pass-upgrade]")), "with a live route to it -- on the PARENT surface");

// ── 14. assign it, then check both boards ───────────────────────────────
await page.click(`[data-pass-choose="${childA}"]`);
await page.waitForSelector("[data-pass-assignment]:not([data-pass-unassigned])", { timeout: 20000 });
ok(!(await page.$("[data-pass-unassigned]")), "assigning the pass clears the blocking state");

await page.goto(`${BASE}/app/child/${childA}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
const coveredTicket = await page.getAttribute("[data-ticket-empty], button[data-ticket-empty]", "data-ticket-disabled").catch(() => null);
const coveredHtml = await page.content();
ok(coveredTicket === null, "the covered child's boarding pass is live");
ok(!coveredHtml.includes("いまは のれません"), "and does not say they cannot board");

await page.goto(`${BASE}/app/child/${childB}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
const lockedHtml = await page.content();
ok(lockedHtml.includes("いまは のれません"), "the uncovered sibling's board says 「いまは のれません」");
ok(!/¥|アップグレード|9,800|3,800/.test(lockedHtml), "and carries no price, tier, or upgrade");
ok(!lockedHtml.includes("/subscribe"), "and no route into commerce");
ok(!lockedHtml.includes("保護者の方へ"), "and does not send the child to fetch a parent about money");
// The train itself is still there -- canView is never false.
ok((await page.$$("[data-strip-car]")).length > 0, "the train, line strip and stamps are all still visible");
const ticketDisabled = await page.getAttribute("[data-ticket-disabled]", "aria-disabled").catch(() => null);
ok(ticketDisabled === "true", "the boarding pass is genuinely disabled, not just styled");

// ── 15. the cooldown ─────────────────────────────────────────────────────
// Inside 30 days the pass cannot be moved, and the card SAYS so rather than
// letting a parent tap and be refused. (assignAnnualPass refuses it too, with
// COOLDOWN_ACTIVE, but that is belt-and-braces behind this state; the
// arithmetic itself is covered in scripts/multi-child.test.ts.)
await page.goto(`${BASE}/app/parent`);
await page.waitForSelector("[data-pass-cooldown]", { timeout: 20000 });
const cooldownText = (await page.textContent("[data-pass-cooldown]")) ?? "";
ok(/次に変更できるのは/.test(cooldownText) && /以降です/.test(cooldownText),
   `the cooldown names the date it ends: ${cooldownText.trim()}`);
ok((await page.getAttribute(`[data-pass-choose="${childB}"]`, "disabled")) !== null,
   "and the sibling cannot be chosen while it runs");

// The pass did NOT move.
await page.goto(`${BASE}/app/child/${childA}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
ok(!(await page.content()).includes("いまは のれません"), "the pass stayed with the child who had it");

// ── 16. upgrade to a buyout: coverage is cleared, everyone rides ─────────
const buyout = await shopifyWebhook(
  page,
  "orders/paid",
  { id: 90002, name: "#1002", line_items: [{ variant_id: 111 }], note_attributes: [{ name: "kd_token", value: token }] },
  `wh-buyout-${Date.now()}`,
);
ok(buyout.status === 200, `a signed orders/paid for the buyout variant is accepted (${buyout.status})`);

await page.goto(`${BASE}/app/child/${childB}`);
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
ok(!(await page.content()).includes("いまは のれません"), "after the buyout the previously-locked sibling rides");
await page.goto(`${BASE}/app/parent`);
await page.waitForSelector("[data-add-child]", { timeout: 20000 });
ok(!(await page.$("[data-pass-assignment]")), "and the assignment card is gone -- a buyout has nothing to assign");

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall live checks passed");
process.exit(fails.length ? 1 : 0);
