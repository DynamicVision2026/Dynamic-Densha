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
  localStorage.clear();
  localStorage.setItem("densha.locale", "ja");
});

const shot = async (name) => {
  try {
    await page.screenshot({
      path: `${outDir}/${name}`,
      timeout: 4_000,
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
await page.getByText("かたちの試乗").waitFor({ timeout: 15_000 });
const home = await dump("u1u4-home");
if (!home.includes("林")) throw new Error("home missing 林 sample");
if (!home.includes("きょうの残響")) throw new Error("home missing echo queue");
await shot("u1u4-home.png");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("右")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByText("時刻表へ").waitFor({ timeout: 15_000 });
await page.getByText("きのうの字の、残響です").waitFor({ timeout: 10_000 });
const echo = await dump("u1u4-migi-echo");
if (!echo.includes("右手")) throw new Error(`echo did not show 右手:\n${echo}`);
if (!/みぎ/.test(echo)) throw new Error(`echo missing みぎ:\n${echo}`);
await shot("u1u4-migi-echo.png");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("林")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByRole("button", { name: /乗った/ }).waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: /乗った/ }).click();
await page.getByText("わかる").waitFor();
await page.locator("button").filter({ hasText: /よみを見る/ }).first().click();
{
  const listenBtn = page.getByRole("button", { name: /を聞く/ });
  if (await listenBtn.count()) await listenBtn.first().click();
}
await page.locator("button").filter({ hasText: /掛け軸に置く/ }).first().click();
await page.getByRole("button", { name: /わかった/ }).click();

const untilShape = Date.now() + 40_000;
let sawComponent = false;
while (Date.now() < untilShape) {
  const text = await page.locator("body").innerText();
  if (text.includes("パーツを、正しい位置に置く")) {
    sawComponent = true;
    break;
  }
  const next = page.locator('[data-tour="next"]');
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(250);
    continue;
  }
  const choice = page.locator('[data-tour="choice-correct"]');
  if (await choice.count()) {
    await choice.click();
    const check = page.locator('[data-tour="check"]');
    if (await check.count()) await check.click();
    await page.waitForTimeout(250);
    continue;
  }
  await page.waitForTimeout(200);
}
if (!sawComponent) {
  const text = await dump("u1u4-hayashi-fail");
  throw new Error(`林 never reached component assembly:\n${text}`);
}
await dump("u1u4-hayashi-shape");
await shot("u1u4-hayashi-shape.png");

for (let i = 0; i < 4; i++) {
  const piece = page.locator('[data-tour="component-next"]');
  if (!(await piece.count())) break;
  await piece.first().click();
  await page.waitForTimeout(550);
}
await page.waitForTimeout(800);
const after = await dump("u1u4-hayashi-placed");
await shot("u1u4-hayashi-placed.png");
if (!/つぎへ|到着/.test(after)) {
  throw new Error(`placing 林 parts did not complete:\n${after}`);
}

await page.goto(`${base}/demo/kanji/${encodeURIComponent("王")}`, {
  waitUntil: "domcontentloaded",
});
await page.getByRole("button", { name: /乗った/ }).waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: /乗った/ }).click();
await page.locator("button").filter({ hasText: /よみを見る/ }).first().click();
{
  const listenBtn = page.getByRole("button", { name: /を聞く/ });
  if (await listenBtn.count()) await listenBtn.first().click();
}
await page.locator("button").filter({ hasText: /掛け軸に置く/ }).first().click();
await page.getByRole("button", { name: /わかった/ }).click();
const untilStroke = Date.now() + 40_000;
let sawStroke = false;
while (Date.now() < untilStroke) {
  const text = await page.locator("body").innerText();
  if (text.includes("画を、正しい順に置く")) {
    sawStroke = true;
    break;
  }
  const next = page.locator('[data-tour="next"]');
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(250);
    continue;
  }
  const choice = page.locator('[data-tour="choice-correct"]');
  if (await choice.count()) {
    await choice.click();
    const check = page.locator('[data-tour="check"]');
    if (await check.count()) await check.click();
    await page.waitForTimeout(250);
    continue;
  }
  await page.waitForTimeout(200);
}
if (!sawStroke) {
  const text = await dump("u1u4-wang-fail");
  throw new Error(`王 never reached stroke assembly:\n${text}`);
}
await dump("u1u4-wang-stroke");
await shot("u1u4-wang-stroke.png");

if (errors.length) {
  writeFileSync(`${outDir}/u1u4-console.txt`, errors.join("\n"));
  throw new Error(`console errors:\n${errors.join("\n")}`);
}

writeFileSync(`${outDir}/u1u4-ok.txt`, "ok");
await browser.close();
console.log(JSON.stringify({ ok: true, errors: [] }));
