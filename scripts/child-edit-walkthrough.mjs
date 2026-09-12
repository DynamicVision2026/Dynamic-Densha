import { chromium, devices } from "playwright";
import { signInWithNewAccount } from "./walkthrough-session.mjs";

/**
 * The reported bug, driven exactly as a parent drove it: rename a child AND
 * change their school year, then press 保存 once.
 *
 * Before the unified save this reported success and persisted only the
 * nickname -- saving the name closed the panel, and closing it re-read the
 * year from the server, silently discarding the selection. So the checks that
 * matter here are the two that failed: the row must show the new year, and it
 * must still show it after a reload, which is the only way to tell a cache
 * from a column.
 */

const BASE = "http://localhost:8080";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

// A household of our own, so the edits below cannot be confused with any
// state a previous run left behind.
await signInWithNewAccount(page, BASE, { childName: "Brian2023" });

await page.goto(`${BASE}/app/parent/settings`);
await page.waitForSelector("[data-child-row]", { timeout: 20000 });
const childId = await page.getAttribute("[data-child-row]", "data-child-row");

const rowText = async () => (await page.textContent(`[data-child-row="${childId}"]`)) ?? "";
const gradeOf = async () => Number((await rowText()).match(/(\d)年/)?.[1]);

const startGrade = await gradeOf();
const target = startGrade === 3 ? 2 : 3;
ok(Number.isInteger(startGrade), `the row states a school year to begin with: ${startGrade}年`);

// ── 1. nothing staged, nothing to save ───────────────────────────────────
await page.click(`[data-child-edit="${childId}"]`);
await page.waitForSelector(`#name-${childId}`, { timeout: 10000 });
ok(await page.isDisabled(`[data-child-save="${childId}"]`), "保存 is inert until something is actually edited");
ok(!(await page.$(`[data-child-dirty="${childId}"]`)), "and nothing claims to be unsaved");

// ── 2. the reported edit: name AND year, one 保存 ─────────────────────────
await page.fill(`#name-${childId}`, "Brian1");
await page.click(`[data-grade-pick="${target}"]`);
ok(await page.$(`[data-child-dirty="${childId}"]`), "two staged edits are declared unsaved");
ok(await page.isEnabled(`[data-child-save="${childId}"]`), "and 保存 is now live");

await page.click(`[data-child-save="${childId}"]`);
await page.waitForSelector("[data-grade-confirm]", { timeout: 10000 });
const safeNote = (await page.textContent("[data-grade-safe-note]")) ?? "";
ok(
  /これまでのかんぺきな記録は消えません/.test(safeNote),
  `the year change still leads with what does NOT change: ${safeNote.trim()}`,
);
const confirmText = (await page.textContent("[data-grade-confirm]")) ?? "";
ok(
  confirmText.includes("Brian1"),
  `and names the child as they are about to be called: ${confirmText.replace(/\s+/g, " ").trim().slice(0, 60)}`,
);
ok(
  await page.isDisabled(`[data-child-save="${childId}"]`),
  "while the confirm is open, 保存 cannot commit the same form twice",
);

await page.click(`[data-grade-apply="${childId}"]`);
await page.waitForFunction(() => !document.querySelector("[data-grade-confirm]"), { timeout: 20000 });

// ── 3. BOTH edits land, in the row, with no reload ───────────────────────
await page.waitForFunction(
  (id) => document.querySelector(`[data-child-row="${id}"]`)?.textContent?.includes("Brian1"),
  childId,
  { timeout: 20000 },
);
const afterText = await rowText();
ok(afterText.includes("Brian1"), `the nickname persists: ${afterText.replace(/\s+/g, " ").trim()}`);
ok(
  (await gradeOf()) === target,
  `and the school year moves with it, without a refresh: ${startGrade}年 → ${await gradeOf()}年 (wanted ${target}年)`,
);

// ── 4. a column, not a cache ─────────────────────────────────────────────
await page.reload();
await page.waitForSelector("[data-child-row]", { timeout: 20000 });
ok((await rowText()).includes("Brian1"), "the nickname survives a reload");
ok((await gradeOf()) === target, `and so does the year: ${await gradeOf()}年`);

// ── 5. 乗りはじめ chosen in the same save outlives the route re-cut ───────
await page.click(`[data-child-edit="${childId}"]`);
await page.waitForSelector(`[data-child-band="${childId}"]`, { timeout: 10000 });
const nextGrade = target === 3 ? 4 : 3;
await page.click(`[data-grade-pick="${nextGrade}"]`);
await page.click(`[data-child-band="${childId}"] [data-tour="band-end"]`);
await page.click(`[data-child-save="${childId}"]`);
await page.waitForSelector("[data-grade-confirm]", { timeout: 10000 });
await page.click(`[data-grade-apply="${childId}"]`);
await page.waitForFunction(() => !document.querySelector("[data-grade-confirm]"), { timeout: 20000 });
await page.reload();
await page.waitForSelector("[data-child-row]", { timeout: 20000 });
await page.click(`[data-child-edit="${childId}"]`);
await page.waitForSelector(`[data-child-band="${childId}"]`, { timeout: 10000 });
const band = await page.getAttribute(`[data-child-band="${childId}"] [data-start-band]`, "data-start-band");
ok(band === "end", `乗りはじめ picked alongside a year change is not reset by it: ${band}`);
ok((await gradeOf()) === nextGrade, `and the year still moved: ${await gradeOf()}年`);

// ── 6. closing the panel abandons what was staged ────────────────────────
await page.fill(`#name-${childId}`, "捨てる");
await page.click(`[data-child-edit="${childId}"]`);          // close
await page.click(`[data-child-edit="${childId}"]`);          // reopen
await page.waitForSelector(`#name-${childId}`, { timeout: 10000 });
const reopened = await page.inputValue(`#name-${childId}`);
ok(reopened === "Brian1", `a discarded edit does not lie in wait: ${reopened}`);
ok(await page.isDisabled(`[data-child-save="${childId}"]`), "and the reopened panel has nothing to save");

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\none 保存 saves the whole child profile");
process.exit(fails.length ? 1 : 0);
