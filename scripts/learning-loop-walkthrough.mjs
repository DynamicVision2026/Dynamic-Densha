import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  locale: "ja-JP",
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.addInitScript(() => {
  localStorage.setItem("densha.locale", "ja");
});

const shot = async (name) => {
  try {
    await page.screenshot({
      path: `${outDir}/${name}`,
      timeout: 5_000,
      animations: "disabled",
    });
  } catch (err) {
    writeFileSync(`${outDir}/${name}.fail.txt`, String(err));
  }
};
const dump = async (name) => {
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  return text;
};

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByText("きょうの残響").waitFor({ timeout: 15_000 });
const homeText = await dump("loop-demo-home");
if (!homeText.includes("きょうの残響")) {
  throw new Error("demo home missing echo queue");
}
if (!homeText.includes("右")) throw new Error("echo queue missing 右");
await shot("loop-demo-home.png");

await page.locator('a[href*="%E7%8E%8B"], a[href*="/kanji/王"]').first().click();
await page.waitForURL(/kanji/);
await page.waitForTimeout(400);
const encounter = await dump("loop-wang-encounter");
if (!/乗った|出会う|Boarded|Meet/.test(encounter)) {
  throw new Error(`new kanji did not open on encounter: ${page.url()}`);
}
await shot("loop-wang-encounter.png");

await page.getByRole("button", { name: /乗った|Boarded|坐上了/ }).click();
await page.getByText("わかる").or(page.getByText("Understand")).waitFor();
await dump("loop-wang-understand");
await page.locator("button").filter({ hasText: /よみを見る|Show readings|看读音|看讀音/ }).first().click();
{
  const listenBtn = page.getByRole("button", { name: /を聞く|Listen|听|聽/ });
  if (await listenBtn.count()) await listenBtn.first().click();
}
await page.locator("button").filter({ hasText: /掛け軸に置く|Place on the scroll|放到挂轴|放到掛軸/ }).first().click();
await shot("loop-wang-understand.png");
await page.getByRole("button", { name: /わかった|I see|明白了/ }).click();
await page.waitForTimeout(500);
const practiceText = await dump("loop-wang-practice");
if (!/こたえ合わせ|Check|核对|核對/.test(practiceText)) {
  throw new Error("practice did not appear after understand");
}
await shot("loop-wang-practice.png");

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByText("きょうの残響").waitFor({ timeout: 15_000 });
await page.locator('a[href*="%E5%8F%B3"], a[href*="/kanji/右"]').first().click();
await page.waitForURL(/kanji/);
await page.waitForTimeout(400);
const echoText = await dump("loop-migi-echo");
if (!/残響|echo|回声|回聲/i.test(echoText)) {
  throw new Error("右 did not open echo banner");
}
await shot("loop-migi-echo.png");

await page.goto(`${base}/demo/parent`, { waitUntil: "domcontentloaded" });
await page.getByText("到達と所見").waitFor({ timeout: 15_000 });
const parentText = await dump("loop-parent");
if (!/かんぺき|Perfect|到达|到達/.test(parentText)) {
  throw new Error("parent overview missing status labels");
}
await shot("loop-parent.png");

await browser.close();
console.log(JSON.stringify({ ok: errors.length === 0, errors, url: base }, null, 2));
if (errors.length) process.exit(1);
