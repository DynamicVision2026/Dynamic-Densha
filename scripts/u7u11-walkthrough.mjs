import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "ja-JP" });
page.setDefaultTimeout(20_000);
await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("densha.locale", "ja");
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const dump = async (name) => {
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  try {
    await page.screenshot({ path: `${outDir}/${name}.png`, animations: "disabled", timeout: 4000 });
  } catch {
    /* fonts */
  }
  return text;
};

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByRole("link", { name: "路線図" }).waitFor();
const home = await dump("u7u11-home");
if (!home.includes("路線図")) throw new Error("home missing 路線図 nav");
if (!home.includes("スタンプ")) throw new Error("home missing スタンプ nav");

await page.goto(`${base}/demo/map`, { waitUntil: "domcontentloaded" });
await page.locator('[data-tour="map-title"]').waitFor();
const map = await dump("u7u11-map");
if (!map.includes("木の線")) throw new Error("map missing 木の線");
if (!map.includes("せいの線")) throw new Error("map missing せいの線");
if (!map.includes("手の線")) throw new Error("map missing 手の線");
if (!map.includes("乗り間違い注意")) throw new Error("map missing confusable section");
if (!map.includes("未開通")) throw new Error("G1 map should grey later-grade stations");

await page.goto(`${base}/demo/stamps`, { waitUntil: "domcontentloaded" });
await page.locator('[data-tour="stamps-title"]').waitFor();
const stamps = await dump("u7u11-stamps");
if (!stamps.includes("一")) throw new Error("stamp book missing seeded 一");
if (stamps.includes("まだスタンプがありません")) throw new Error("stamp book empty despite 一 perfect");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("右")}`, { waitUntil: "domcontentloaded" });
await page.getByText("右手", { exact: true }).waitFor();
const echo = await dump("u7u11-echo");
if (echo.includes("車内アナウンス")) throw new Error("echo must not show announcement");
if (echo.includes("乗り間違い注意")) throw new Error("echo must not inject confusable");

await page.goto(`${base}/demo/parent`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "路線のようす" }).waitFor();
const parent = await dump("u7u11-parent");
if (!parent.includes("路線のようす")) throw new Error("parent missing line progress");

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "ja-JP",
});
await mobile.route("https://fonts.googleapis.com/**", (r) => r.abort());
await mobile.route("https://fonts.gstatic.com/**", (r) => r.abort());
await mobile.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("densha.locale", "ja");
});
await mobile.goto(`${base}/demo/map`, { waitUntil: "domcontentloaded" });
await mobile.getByText("木の線").waitFor();
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
try {
  await mobile.screenshot({ path: `${outDir}/u7u11-map-mobile.png`, animations: "disabled", timeout: 4000 });
} catch {
  /* fonts */
}
if (overflow) throw new Error("map overflows at 390px");

if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(`${outDir}/u7u11-ok.txt`, "ok");
await browser.close();
console.log(JSON.stringify({ ok: true }));
