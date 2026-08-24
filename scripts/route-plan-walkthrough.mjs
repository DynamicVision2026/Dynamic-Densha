import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "ja-JP",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.addInitScript(() => {
  if (sessionStorage.getItem("densha.routeplan.init")) return;
  sessionStorage.setItem("densha.routeplan.init", "1");
  localStorage.clear();
  localStorage.setItem("densha.locale", "ja");
});

const dump = async (name) => {
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  return text;
};

const go = async (path) => {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      return;
    } catch (err) {
      if (i === 2) throw err;
      await page.waitForTimeout(400);
    }
  }
};

await go("/demo");
await page.getByText("時刻表").first().waitFor({ timeout: 15_000 });
await page.waitForURL(/grade=/, { timeout: 8_000 });
await page.locator("[data-departure-board]").waitFor({ timeout: 10_000 });
const home = await dump("route-plan-home");
if (!home.includes("発車標")) throw new Error(`P1 board missing:\n${home}`);
if (!home.includes("あたらしい えき")) throw new Error(`P1 new stations missing:\n${home}`);
if (!home.includes("きょうの残響")) throw new Error("S1 echo queue missing on timetable");
if (/遅れ|behind|追いつき/i.test(home)) throw new Error(`child UI used deficit copy:\n${home}`);

await go("/demo/parent");
await page.getByText("今週おしえたこと").waitFor({ timeout: 10_000 });
await page.locator("[data-start-band]").waitFor({ timeout: 8_000 });
const parentBegin = await dump("route-plan-parent-begin");
if (!parentBegin.includes("乗りはじめ")) throw new Error(`P0 start band missing:\n${parentBegin}`);
if (!parentBegin.includes("これからの見とおし")) throw new Error(`P0 forward missing:\n${parentBegin}`);
if (!parentBegin.includes("今週の乗車記録")) throw new Error(`P1 week ride missing:\n${parentBegin}`);
if (!parentBegin.includes("この学年の路線")) throw new Error(`P0 route map missing:\n${parentBegin}`);
if (!parentBegin.includes("一")) throw new Error("route strip missing 一");

const snap = async () =>
  page.evaluate(() => {
    const raw = localStorage.getItem("densha.demo.progress.v2");
    if (!raw) return {};
    const all = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(all)) out[k] = v.status;
    return out;
  });

const before = await snap();
await page.locator('[data-tour="band-middle"]').click();
await page.waitForTimeout(300);
const parentMid = await dump("route-plan-parent-mid");
if (!parentMid.includes("なか")) throw new Error(`band did not switch:\n${parentMid}`);
const after = await snap();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`start band change wiped mastery:\n${JSON.stringify(before)}\n${JSON.stringify(after)}`);
}
if (after["一"] !== "perfect") throw new Error("一 must stay かんぺき after band change");

await go("/demo");
await page.locator("[data-departure-board]").waitFor({ timeout: 10_000 });
const homeMid = await dump("route-plan-home-mid");
if (homeMid.includes("発車標") && /あたらしい えき[\s\S]{0,80}一/.test(homeMid)) {
  throw new Error(`なか first week still forced 一 as new:\n${homeMid}`);
}

if (errors.length) {
  writeFileSync(`${outDir}/route-plan-errors.txt`, errors.join("\n"));
}

await browser.close();
console.log("route-plan walkthrough ok");
