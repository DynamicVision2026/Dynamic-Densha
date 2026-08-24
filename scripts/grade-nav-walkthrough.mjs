import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "en-US",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.addInitScript(() => {
  localStorage.clear();
});

const dump = async (name) => {
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  return text;
};
const shot = async (name) => {
  try {
    await page.screenshot({ path: `${outDir}/${name}`, timeout: 12_000, animations: "disabled" });
  } catch {
    /* screenshot is evidence, not the assertion */
  }
};
const dismissAnnounce = async () => {
  const btn = page.locator('[data-tour="announce-dismiss"]');
  try {
    await btn.waitFor({ timeout: 2500 });
    await btn.click();
    await page.waitForTimeout(200);
  } catch {
    /* no overlay */
  }
};

page.setDefaultNavigationTimeout(60_000);
page.setDefaultTimeout(20_000);

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByText("時刻表").first().waitFor({ timeout: 15_000 });
const home = await dump("grade-nav-g1");
if (!home.includes("1年生の時刻表")) throw new Error(`G1 default missing:\n${home}`);
if (!home.includes("王")) throw new Error("G1 missing 王");
if (!home.includes("字表")) throw new Error("catalog nav missing");
if (!home.includes("いま：1年生")) throw new Error(`now-grade chip missing:\n${home}`);
await shot("grade-nav-g1.png");

await page.getByRole("link", { name: "2年" }).first().click();
await page.waitForURL(/grade=2/, { timeout: 10_000 });
const g2 = await dump("grade-nav-g2");
if (!g2.includes("2年生の時刻表")) throw new Error(`G2 title missing:\n${g2}`);
if (!g2.includes("引") || !g2.includes("羽") || !g2.includes("雲")) {
  throw new Error(`G2 first train missing:\n${g2}`);
}
if (g2.includes("1年生の時刻表")) throw new Error("still showing G1 after switch");
if (!g2.includes("星")) throw new Error("G2 later train 星 must be listed and open");
await shot("grade-nav-g2.png");

await page.getByRole("link", { name: /星 はじめて/ }).first().click();
await page.waitForURL(/kanji/, { timeout: 10_000 });
await dismissAnnounce();
await page.getByText("星").first().waitFor({ timeout: 10_000 });
const starPlay = await dump("grade-nav-star-jump");
if (!starPlay.includes("星")) throw new Error(`jump to 星 failed:\n${starPlay}`);
await dismissAnnounce();
await page.locator('[data-tour="back-timetable"]').click({ force: true });
try {
  await page.waitForURL(/\/demo(\?|$)/, { timeout: 20_000 });
  await page.getByText("2年生の時刻表").waitFor({ timeout: 20_000 });
} catch (err) {
  await dump("fail-back-g2");
  throw err;
}
const backG2 = await dump("grade-nav-back-g2");
if (!backG2.includes("2年生の時刻表")) throw new Error(`back lost G2:\n${backG2}`);

await page.goto(`${base}/demo?grade=3`, { waitUntil: "domcontentloaded" });
await page.getByText("3年生の時刻表").waitFor({ timeout: 20_000 });
await page.getByRole("link", { name: /漢 / }).first().waitFor({ timeout: 15_000 });
await shot("grade-nav-g3.png");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("漢")}?mode=look`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page.waitForURL(/kanji/, { timeout: 20_000 });
await dismissAnnounce();
await page.getByText("いみ").first().waitFor({ timeout: 15_000 });
const han = await dump("grade-nav-han");
if (/Sino-/.test(han)) throw new Error(`漢 still English:\n${han}`);
if (!han.includes("漢字") && !han.includes("かん")) throw new Error(`漢 いみ not JA:\n${han}`);
await shot("grade-nav-han.png");
await page.waitForTimeout(300);

await page.goto(`${base}/demo?grade=5`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByText("5年生の時刻表").waitFor({ timeout: 10_000 });
const g5 = await dump("grade-nav-g5");
if (!g5.includes("いま：5年生")) throw new Error(`G5 chip missing:\n${g5}`);
await page.getByRole("link", { name: "路線図" }).click();
await page.waitForURL(/map/, { timeout: 10_000 });
await page.getByText("いま：5年生").first().waitFor({ timeout: 10_000 });
const map5 = await dump("grade-nav-g5-map");
if (!page.url().includes("grade=5")) throw new Error(`map URL lost grade: ${page.url()}`);
if (!map5.includes("いま：5年生")) throw new Error(`map not G5 lens:\n${map5}`);
if (map5.includes("1年生の時刻表")) throw new Error("map still showing G1 timetable copy");
await shot("grade-nav-g5-map.png");

await page.getByRole("link", { name: "時刻表" }).click();
await page.waitForURL(/\/demo/, { timeout: 10_000 });
await page.getByText("5年生の時刻表").waitFor({ timeout: 10_000 });
const backG5 = await dump("grade-nav-back-g5");
if (!backG5.includes("5年生の時刻表")) throw new Error(`return from map lost G5:\n${backG5}`);

await page.goto(`${base}/demo/catalog?q=${encodeURIComponent("鬱")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByText("配当表にありません").first().waitFor({ timeout: 10_000 });
const empty = await dump("grade-nav-utsushi");
if (!empty.includes("配当表にありません")) throw new Error(`鬱 empty missing:\n${empty}`);
await shot("grade-nav-utsushi.png");

await page.goto(`${base}/demo/catalog?grade=2&q=${encodeURIComponent("星")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByRole("link", { name: "星 2年生" }).waitFor({ timeout: 10_000 });
const star = await dump("grade-nav-star");
if (!star.includes("星")) throw new Error(`星 missing from catalog:\n${star}`);
await page.getByRole("link", { name: "星 2年生" }).click();
await page.waitForURL(/kanji/, { timeout: 20_000 });
await page.getByText("星").first().waitFor({ timeout: 10_000 });
const starPage = await dump("grade-nav-star-open");
if (!starPage.includes("星")) throw new Error(`星 did not open:\n${starPage}`);
await shot("grade-nav-star-open.png");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("麒")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByText("配当表にありません").first().waitFor({ timeout: 10_000 });
const ki = await dump("grade-nav-kirin");
if (!ki.includes("配当表にありません")) throw new Error(`麒 should reject:\n${ki}`);

if (errors.length) {
  console.error(errors.slice(0, 8).join("\n"));
  throw new Error(`page errors: ${errors.length}`);
}

writeFileSync(`${outDir}/grade-nav-ok.txt`, "ok\n");
await browser.close();
console.log("grade-nav walkthrough ok");
