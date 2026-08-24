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
await page.getByText("木の線").waitFor();
const home = await dump("u5u6-home");
if (!home.includes("木の線")) throw new Error("home missing 木の線");
if (!home.includes("意味")) throw new Error("home missing semantic tag");
if (!home.includes("林")) throw new Error("home missing 林 on strip");

await page.locator('[data-tour="sample-林"]').click();
await page.getByText("車内アナウンス").waitFor();
const ann = await dump("u5u6-announce");
if (ann.includes("森林") === false) throw new Error(`announce missing 森林:\n${ann}`);

await page.locator('[data-tour="announce-dismiss"]').click();
await page.getByText("乗った").waitFor();
const hayashi = await dump("u5u6-hayashi-strip");
if (!hayashi.includes("木の線")) throw new Error("林 session missing line strip");
if (hayashi.includes("森林")) throw new Error("dismissed announce should not remain");
if (!hayashi.includes("未開通") && !hayashi.includes("いま")) {
  /* G1 木線 all open — いま on 林 is enough */
}
if (!hayashi.includes("いま")) throw new Error("current station not marked いま");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("生")}`, { waitUntil: "domcontentloaded" });
await page.getByText("車内アナウンス").waitFor();
await page.locator('[data-tour="announce-dismiss"]').click();
await page.getByText("せいの線").waitFor();
const sei = await dump("u5u6-sei-strip");
if (!sei.includes("せいの線")) throw new Error("生 missing phonetic line");
if (!sei.includes("音")) throw new Error("phonetic tag missing");
if (!sei.includes("未開通")) throw new Error("星 should be 未開通 on G1 せいの線");
if (!sei.includes("星")) throw new Error("next station 星 missing");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("右")}`, { waitUntil: "domcontentloaded" });
await page.getByText("右手", { exact: true }).waitFor();
const echo = await dump("u5u6-echo-no-announce");
if (echo.includes("車内アナウンス")) throw new Error("echo must not show announcement");
if (!echo.includes("右手")) throw new Error("echo missing 右手");

if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(`${outDir}/u5u6-ok.txt`, "ok");
await browser.close();
console.log(JSON.stringify({ ok: true }));
