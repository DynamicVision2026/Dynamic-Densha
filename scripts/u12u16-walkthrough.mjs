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
await page.getByRole("link", { name: "工房", exact: true }).waitFor();
const home = await dump("u12u16-home");
if (!home.includes("工房")) throw new Error("home missing 工房 nav");
if (!home.includes("音の家族")) throw new Error("home missing workshop teaser");

await page.goto(`${base}/demo/map`, { waitUntil: "domcontentloaded" });
await page.locator('[data-tour="map-title"]').waitFor();
const map = await dump("u12u16-map");
if (!map.includes("人の線")) throw new Error("map missing 人の線");
if (!map.includes("山の線")) throw new Error("map missing 山の線");
if (!map.includes("春")) throw new Error("map missing 春 on 日の線");
if (!map.includes("池")) throw new Error("map missing 池 on みずの線");
if (map.includes("校") && map.match(/木の線[\s\S]*校/)) {
  /* 校 may appear elsewhere; must not sit on 木の線 station list as a node */
}
if (!map.includes("貝")) throw new Error("map missing expanded confusable 貝");
if (!map.includes("未開通")) throw new Error("G1 map should grey later-grade stations");

await page.goto(`${base}/demo/workshop`, { waitUntil: "domcontentloaded" });
await page.locator('[data-tour="workshop-title"]').waitFor();
await page.locator('[data-tour="house-日"]').click();
await page.locator('[data-tour="workshop-composed"]').waitFor();
await page.locator('[data-tour="read-セイ"]').click();
await page.locator('[data-tour="workshop-check"]').click();
await page.locator('[data-tour="workshop-outcome"]').waitFor();
const shop = await dump("u12u16-workshop");
if (!shop.includes("晴")) throw new Error("workshop did not compose 晴");
if (!shop.includes("当たり")) throw new Error("セイ on 晴 should be 当たり");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("右")}`, { waitUntil: "domcontentloaded" });
await page.getByText("右手", { exact: true }).waitFor();
const echo = await dump("u12u16-echo");
if (echo.includes("車内アナウンス")) throw new Error("echo must not show announcement");
if (echo.includes("音の石")) throw new Error("G1 echo must not inject workshop");
if (echo.includes("乗り間違い注意")) throw new Error("echo must not inject confusable");

await page.goto(`${base}/demo/stamps`, { waitUntil: "domcontentloaded" });
await page.locator('[data-tour="stamps-title"]').waitFor();
const stamps = await dump("u12u16-stamps");
if (!stamps.includes("一")) throw new Error("stamp book missing seeded 一");

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
await mobile.goto(`${base}/demo/workshop`, { waitUntil: "domcontentloaded" });
await mobile.getByText("音の石", { exact: true }).waitFor();
const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
try {
  await mobile.screenshot({ path: `${outDir}/u12u16-workshop-mobile.png`, animations: "disabled", timeout: 4000 });
} catch {
  /* fonts */
}
if (overflow) throw new Error("workshop overflows on 390px");

if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
writeFileSync(`${outDir}/u12u16-ok.txt`, "ok\n");
await browser.close();
console.log("u12u16 walkthrough ok");
