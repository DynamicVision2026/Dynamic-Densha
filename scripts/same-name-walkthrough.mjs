import { chromium, devices } from "playwright";
const BASE = "http://localhost:8080";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

// The exact production shape: two children, same name, same year.
await page.goto(`${BASE}/app`);
await page.waitForLoadState("networkidle");
if (page.url().includes("/onboard")) {
  await page.fill("#child-name", "Brian2023");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/child\//, { timeout: 20000 });
}
await page.goto(`${BASE}/onboard?add=1`);
await page.waitForSelector("#child-name", { timeout: 20000 });
await page.fill("#child-name", "Brian2023");
await page.click('button[type="submit"]');           // duplicate prompt
await page.waitForSelector("[data-duplicate-name-warning]", { timeout: 20000 });
await page.click('button[type="submit"]');           // confirm it anyway
await page.waitForFunction(() => !location.pathname.startsWith("/onboard"), { timeout: 20000 }).catch(() => {});

// ── settings: both rows distinguishable, rename already open ─────────────
await page.goto(`${BASE}/app/parent/settings`);
// Wait for the ROWS, not the section: the panel renders a skeleton until
// childrenQ resolves, and asserting on it before then tests nothing.
await page.waitForSelector("[data-child-row]", { timeout: 20000 });
const rowText = await page.textContent("[data-settings-children]");
ok(/人目/.test(rowText), `same-named rows carry a distinguishing qualifier: ${(rowText.match(/Brian2023（[^）]*）/g) ?? []).join(", ")}`);
const hints = await page.$$("[data-duplicate-name-hint]");
ok(hints.length === 2, `the rename field opens itself and explains why (${hints.length} rows)`);
const nameInputs = await page.$$('input[id^="name-"]');
ok(nameInputs.length === 2, "both rename inputs are immediately usable, not behind a disclosure");

// Rename one, inline, and watch the qualifier disappear.
const firstId = await page.getAttribute("[data-child-row]", "data-child-row");
await page.fill(`#name-${firstId}`, "たろう");
await page.click(`[data-rename-save="${firstId}"]`);
await page.waitForFunction(() => document.querySelector("[data-settings-children]").textContent.includes("たろう"), { timeout: 20000 });
const afterText = await page.textContent("[data-settings-children]");
ok(afterText.includes("たろう"), "the inline rename lands");
ok(!/Brian2023（/.test(afterText), "and the qualifier drops once the names are distinct again");

// ── the child switcher also disambiguates ───────────────────────────────
await page.goto(`${BASE}/app`);
await page.waitForSelector("[data-child-switcher]", { timeout: 20000 });
const switcherText = await page.textContent("[data-child-switcher]");
ok(switcherText.includes("たろう") && switcherText.includes("Brian2023"),
   `the child switcher names both distinctly: ${switcherText.replace(/\s+/g, " ").trim()}`);
ok(!/¥|プラン|パス/.test(switcherText), "and still leaks nothing about plans or passes");

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nsame-name siblings are distinguishable everywhere");
process.exit(fails.length ? 1 : 0);
