import { chromium, devices } from "playwright";
import { signInWithNewAccount } from "./walkthrough-session.mjs";

/**
 * The "last child" server refusal is defense-in-depth: the archive control
 * only renders at all when a household has more than one child
 * (`children.length > 1 ? <ArchiveControl /> : null`), so a single well-
 * behaved tab can never even show the button that would trigger it. The
 * guard exists for the race it actually defends against -- two tabs (or two
 * co-parents) both looking at a two-child household, one archives a child,
 * the OTHER tab -- still showing its stale two-child view -- tries to
 * archive what is now the last one. This drives exactly that race, in the
 * ENGLISH locale, and checks what lands on screen.
 *
 * Before this fix: archiveChild throws the fixed ja string
 * "最後のお一人は非表示にできません", and parent.settings.tsx rendered
 * `archiveMut.error.message` verbatim -- an English-reading parent would see
 * a bare Japanese sentence in the middle of their own language's UI.
 */

const BASE = "http://localhost:8080";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page1 = await ctx.newPage();
page1.on("dialog", (d) => d.accept());

await signInWithNewAccount(page1, BASE, { childName: "たろう" });
await page1.evaluate(() => window.localStorage.setItem("densha.locale", "en"));

// A second child, so the archive control has something to show.
await page1.goto(`${BASE}/onboard?add=1`);
await page1.waitForSelector("#child-name", { timeout: 20000 });
await page1.fill("#child-name", "hanako");
await page1.click('button[type="submit"]');
await page1.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 20000 }).catch(() => {});

// Both tabs load settings while the household still has two children.
await page1.goto(`${BASE}/app/parent/settings`);
await page1.waitForSelector("[data-archive-pick]", { timeout: 20000 });
const page2 = await ctx.newPage();
page2.on("dialog", (d) => d.accept());
await page2.goto(`${BASE}/app/parent/settings`);
await page2.waitForSelector("[data-archive-pick]", { timeout: 20000 });
ok(
  (await page2.textContent("[data-settings-children]"))?.includes("Children"),
  "the second tab is also in English",
);

const picks1 = await page1.$$("[data-archive-pick]");
const picks2 = await page2.$$("[data-archive-pick]");
ok(picks1.length === 2 && picks2.length === 2, `both tabs see both children (${picks1.length}, ${picks2.length})`);

// Tab 1 archives the first child -- succeeds, household now has one left.
await page1.click("[data-archive-pick]");
await page1.waitForSelector("[data-archive-confirm]", { timeout: 20000 });
await page1.click("[data-archive-confirm] button");
await page1.waitForFunction(
  () => document.querySelectorAll("[data-child-row]").length === 1,
  { timeout: 20000 },
);
ok(true, "tab 1's archive succeeded -- one child remains");

// Tab 2, still showing its stale two-child view, tries to archive the SAME
// remaining child -- the server now refuses it as the household's last one.
await page2.click("[data-archive-pick]");
await page2.waitForSelector("[data-archive-confirm]", { timeout: 20000 });
await page2.click("[data-archive-confirm] button");
await page2.waitForSelector("[data-archive-error]", { timeout: 20000 });
const shown = (await page2.textContent("[data-archive-error]"))?.trim();
ok(shown === "You can't hide your only child.", `tab 2 sees the English translation: "${shown}"`);
ok(!/[ぁ-んァ-ヶ一-龯]/.test(shown ?? ""), "and it contains no raw Japanese characters");

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\na server refusal reads in the visitor's own locale, not raw ja");
process.exit(fails.length ? 1 : 0);
