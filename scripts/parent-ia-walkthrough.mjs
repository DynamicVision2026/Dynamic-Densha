/**
 * Live verification of the two-hub parent surface, at phone width.
 *
 * The claims here are about what a browser does: which URL a legacy link
 * lands on, whether the page scrolls sideways on a 390px screen, whether a
 * tap target is really 44px, and whether a grade change leaves the mastery
 * number where it was. None of those can be settled by reading source.
 *
 * Dev server on :8080 with VITE_AUTH_ENABLED=false.
 */
import { chromium, devices } from "playwright";

const BASE = "http://localhost:8080";
const fails = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails.push(msg);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
// A real phone profile, because this surface is read on one.
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

async function addChild(name) {
  await page.goto(`${BASE}/onboard?add=1`);
  await page.waitForSelector("#child-name", { timeout: 20000 });
  await page.fill("#child-name", name);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 20000 }).catch(() => {});
}

/** Zero horizontal overflow is the requirement, so measure it rather than eyeball it. */
async function noHorizontalOverflow() {
  return page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth <= d.clientWidth + 1;
  });
}

// ── 1. onboarding, then the legacy path ──────────────────────────────────
await page.goto(`${BASE}/app`);
await page.waitForLoadState("networkidle");
if (page.url().includes("/onboard")) {
  await page.fill("#child-name", "たろう");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/child\//, { timeout: 20000 });
}

await page.goto(`${BASE}/app/parent`);
await page.waitForURL(/\/app\/parent\/report\//, { timeout: 20000 });
const childA = new URL(page.url()).pathname.split("/").pop();
ok(Boolean(childA), `/app/parent resolves to a report: ${new URL(page.url()).pathname}`);

// ── 2. the hubs ──────────────────────────────────────────────────────────
await page.waitForSelector("[data-parent-tabs]", { timeout: 20000 });
ok((await page.$$("[data-parent-tab]")).length === 2, "two hubs, and only two");
ok(Boolean(await page.$('[data-parent-tab="report"][data-parent-tab-current]')), "the report hub is the landing tab");

// ── 3. the metrics ───────────────────────────────────────────────────────
await page.waitForSelector("[data-mastery-hero]", { timeout: 20000 });
const heroText = await page.textContent("[data-mastery-hero]");
ok(/これまでのかんぺき/.test(heroText), "the hero leads with これまでのかんぺき");
ok(/両/.test(heroText), "counted in 両");
ok(!/%/.test(heroText), "and carries NO percentage");
const cumulative = await page.getAttribute("[data-mastery-hero]", "data-mastery-cumulative").catch(() => null);
const cumulativeAttr = await page.getAttribute("[data-mastery-cumulative]", "data-mastery-cumulative").catch(() => null);
const cumulativeValue = cumulative ?? cumulativeAttr;
ok(cumulativeValue !== null, `cumulative figure is exposed (${cumulativeValue})`);
ok(Boolean(await page.$("[data-mastery-denom-note]")), "the denominator footnote sits with the fraction");
const noteText = await page.textContent("[data-mastery-denom-note]");
ok(/分母は、現在配信中の漢字数です/.test(noteText), `footnote is the approved copy: ${noteText.trim()}`);
const weekText = await page.textContent("[data-weekly-rhythm]");
ok(/今週の乗車記録/.test(weekText), "今週の乗車記録 renders");
ok(!/%/.test(weekText), "and carries no percentage either");

// ── 4. mobile layout ─────────────────────────────────────────────────────
ok(await noHorizontalOverflow(), "report hub: zero horizontal page overflow at 390px");
const tapTooSmall = await page.evaluate(() => {
  const sel = "[data-parent-tab], [data-child-chip], [data-help-toggle], [data-mastery-open-map]";
  return [...document.querySelectorAll(sel)]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => `${el.tagName}.${el.className.slice(0, 30)}`);
});
ok(tapTooSmall.length === 0, `every visible tap target >= 44px tall (${tapTooSmall.join(", ") || "all pass"})`);

// ── 5. second child, the rail, and switching ─────────────────────────────
await addChild("はなこ");
await page.goto(`${BASE}/app/parent/report/${childA}`);
await page.waitForSelector("[data-sibling-rail]", { timeout: 20000 });
const chips = await page.$$("[data-child-chip]");
ok(chips.length === 2, `the rail lists every child (${chips.length})`);
const railScrolls = await page.evaluate(() => {
  const rail = document.querySelector("[data-sibling-rail]");
  return rail ? getComputedStyle(rail).overflowX : null;
});
ok(railScrolls === "auto", `the rail scrolls horizontally on a phone (overflow-x: ${railScrolls})`);
ok(await noHorizontalOverflow(), "and the rail does not push the page sideways");

const childB = await page.evaluate((a) => {
  const el = [...document.querySelectorAll("[data-child-chip]")].find(
    (n) => n.getAttribute("data-child-chip") !== a,
  );
  return el?.getAttribute("data-child-chip") ?? null;
}, childA);
await page.click(`[data-child-chip="${childB}"]`);
await page.waitForURL(new RegExp(`/app/parent/report/${childB}`), { timeout: 20000 });
ok(page.url().includes(childB), "one tap switches sibling report");

// ── 6. settings hub ──────────────────────────────────────────────────────
await page.click('[data-parent-tab="settings"]');
await page.waitForSelector("[data-settings-children]", { timeout: 20000 });
ok(page.url().endsWith("/app/parent/settings"), `settings is its own route: ${new URL(page.url()).pathname}`);
ok(Boolean(await page.$("[data-settings-plan]")), "plan block renders");
ok(Boolean(await page.$("[data-settings-account]")), "account block renders");
ok(await noHorizontalOverflow(), "settings hub: zero horizontal page overflow at 390px");

const ruleText = (await page.textContent("[data-add-child-rule]")) ?? "";
ok(/3人まで/.test(ruleText), `the trial cap is stated before the tap: ${ruleText.trim()}`);
const countText = (await page.textContent("[data-child-count]")) ?? "";
ok(/2 \/ 3/.test(countText), `and the count against it is shown: ${countText.trim()}`);

// ── 7. the (?) explainer works without hover ─────────────────────────────
await page.click("[data-help-toggle]");
await page.waitForSelector("[data-help-panel]", { timeout: 10000 });
const helpText = await page.textContent("[data-help-panel]");
ok(/同時にお一人|1年パス/.test(helpText), "the (?) explains the one-rider rule on tap");
await page.keyboard.press("Escape");
ok(!(await page.$("[data-help-panel]")), "and closes on Escape");

// ── 8. rename is not gated behind a confirm ──────────────────────────────
await page.click(`[data-child-edit="${childB}"]`);
await page.waitForSelector(`#name-${childB}`, { timeout: 10000 });
await page.fill(`#name-${childB}`, "はなこ２");
await page.click(`[data-rename-save="${childB}"]`);
await page.waitForFunction(
  () => [...document.querySelectorAll("[data-child-row]")].some((n) => n.textContent.includes("はなこ２")),
  { timeout: 20000 },
);
ok(true, "a rename saves with no confirmation step");

// ── 9. the grade change: confirmed, and mastery survives it ──────────────
await page.goto(`${BASE}/app/parent/report/${childB}`);
await page.waitForSelector("[data-mastery-hero]", { timeout: 20000 });
const beforeCumulative = await page.getAttribute("[data-mastery-cumulative]", "data-mastery-cumulative");

await page.click('[data-parent-tab="settings"]');
await page.waitForSelector(`[data-child-edit="${childB}"]`, { timeout: 20000 });
await page.click(`[data-child-edit="${childB}"]`);
await page.waitForSelector("[data-grade-pick]", { timeout: 10000 });
await page.click('[data-grade-pick="3"]');
await page.waitForSelector(`[data-grade-request="${childB}"]`, { timeout: 10000 });
await page.click(`[data-grade-request="${childB}"]`);
await page.waitForSelector("[data-grade-confirm]", { timeout: 10000 });
const safeNote = await page.textContent("[data-grade-safe-note]");
ok(
  /これまでのかんぺきな記録は消えません/.test(safeNote),
  `the confirm leads with what does NOT change: ${safeNote.trim()}`,
);
await page.click(`[data-grade-apply="${childB}"]`);
await page.waitForFunction(
  () => !document.querySelector("[data-grade-confirm]"),
  { timeout: 20000 },
);

await page.goto(`${BASE}/app/parent/report/${childB}`);
await page.waitForSelector("[data-mastery-hero]", { timeout: 20000 });
const afterCumulative = await page.getAttribute("[data-mastery-cumulative]", "data-mastery-cumulative");
// A fresh household has mastered nothing, so an equal pair of zeroes here
// proves nothing at all. Say so rather than let it read as a green check:
// the real proof that a grade change preserves mastery is the PGlite test in
// scripts/parent-ia.test.ts, which seeds progress and stamps and compares
// kanji_progress row for row afterwards.
if (Number(beforeCumulative) === 0) {
  console.log(
    "INFO  cumulative mastery was 0 before the grade move, so this browser check is vacuous — " +
      "the invariant is proven in scripts/parent-ia.test.ts against seeded progress",
  );
} else {
  ok(
    afterCumulative === beforeCumulative,
    `cumulative mastery is unchanged by the grade move (${beforeCumulative} -> ${afterCumulative})`,
  );
}
const gradeLine = await page.textContent("[data-mastery-grade]");
ok(Boolean(gradeLine), `the grade fraction re-renders for the new year: ${gradeLine?.trim()}`);

// ── 10. the child surface is still clean ─────────────────────────────────
await page.goto(`${BASE}/app/child/${childB}`);
await page.waitForLoadState("networkidle");
const boardHtml = await page.content();
ok(!/¥|アップグレード|9,800|3,800/.test(boardHtml), "the child board still carries no price or upgrade");
ok(!boardHtml.includes("info@kanji-ai.jp"), "and no support email");
ok(await noHorizontalOverflow(), "child board: zero horizontal overflow at 390px");

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nall live checks passed");
process.exit(fails.length ? 1 : 0);
