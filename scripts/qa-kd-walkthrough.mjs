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
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  return text;
};
const shot = async (name) => {
  try {
    await page.screenshot({ path: `${outDir}/${name}`, timeout: 4_000, animations: "disabled" });
  } catch (err) {
    writeFileSync(`${outDir}/${name}.fail.txt`, String(err));
  }
};

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByText("時刻表").first().waitFor({ timeout: 15_000 });
const home = await dump("qa-kd-home");
if (!home.includes("時刻表") || !home.includes("きょうの残響")) {
  throw new Error(`KD-008 default not JA:\n${home}`);
}
if (/\bTimetable\b/.test(home) && !home.includes("時刻表")) {
  throw new Error("KD-008 English shell on cold load");
}
await shot("qa-kd-home.png");

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

await page.goto(`${base}/demo/kanji/${encodeURIComponent("王")}?mode=play`, {
  waitUntil: "domcontentloaded",
});
await dismissAnnounce();
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
const choice = page.locator('[data-tour="choice-correct"]');
await choice.waitFor({ timeout: 20_000 });
const listenCount = await page.getByRole("button", { name: /を聞く/ }).count();
await choice.click();
await page.locator('[data-tour="check"]').click();
const reading = await dump("qa-kd-wang-reading");
if (listenCount < 4) throw new Error(`KD-003/004 listen count ${listenCount}\n${reading}`);
if (!reading.includes("オウ")) throw new Error(`missing オウ:\n${reading}`);
await shot("qa-kd-wang-reading.png");
await page.locator('[data-tour="next"]').click();

await page.getByText("いみ").first().waitFor({ timeout: 10_000 });
const meaning = await dump("qa-kd-wang-meaning");
if (!meaning.includes("おうさまの こども")) throw new Error(`KD-005 meaning:\n${meaning}`);
if (meaning.includes("おうじ") && meaning.includes("オウ") && !meaning.includes("おうさま")) {
  throw new Error(`KD-005 still reading-like:\n${meaning}`);
}
await shot("qa-kd-wang-meaning.png");
await page.locator('[data-tour="choice-correct"]').click();
await page.locator('[data-tour="check"]').click();
await page.locator('[data-tour="next"]').click();

await page.getByText("画を、正しい順に置く").waitFor({ timeout: 10_000 });
const before = await dump("qa-kd-wang-stroke-before");
if (before.includes("順番が違うみたい")) {
  throw new Error(`KD-006 error shown before input:\n${before}`);
}
if (!before.includes("1画目から順にえらぼう")) {
  throw new Error(`KD-001 missing guide:\n${before}`);
}
if (!before.includes("0 / 4") && !before.includes("0/4")) {
  throw new Error(`missing counter:\n${before}`);
}
await shot("qa-kd-wang-stroke-before.png");

const wrong = page.locator("button[aria-label]").filter({ hasNot: page.locator('[data-tour="stroke-next"]') });
const skip = page.getByRole("button", { name: "わからない" });
for (const loc of [page.locator("button[aria-label*='2画目']"), page.locator("button[aria-label*='4画目']")]) {
  if (await loc.count()) {
    await loc.first().click();
    break;
  }
}
await page.waitForTimeout(200);
const afterWrong = await dump("qa-kd-wang-stroke-wrong");
if (!afterWrong.includes("順番が違うみたい")) {
  throw new Error(`KD-001 wrong order silent:\n${afterWrong}`);
}
if (!afterWrong.includes("0 / 4") && !afterWrong.includes("0/4")) {
  throw new Error(`counter moved on wrong:\n${afterWrong}`);
}

for (let i = 0; i < 4; i++) {
  const nextStroke = page.locator('[data-tour="stroke-next"]');
  await nextStroke.waitFor({ timeout: 5_000 });
  await nextStroke.click();
  await page.waitForTimeout(200);
}
await page.waitForTimeout(600);
const after = await dump("qa-kd-wang-stroke-done");
await shot("qa-kd-wang-stroke-done.png");
if (!/つぎへ|到着/.test(after)) {
  throw new Error(`KD-001 did not complete:\n${after}`);
}
if (after.includes("わからない") && after.includes("0 / 4")) {
  throw new Error(`still stuck:\n${after}`);
}

const nextBtn = page.locator('[data-tour="next"]');
if (await nextBtn.count()) await nextBtn.click();
await page.waitForTimeout(400);
const done = await dump("qa-kd-wang-arrive");
await shot("qa-kd-wang-arrive.png");
if (!done.includes("到着") && !done.includes("だいたい")) {
  throw new Error(`did not arrive:\n${done}`);
}

await page.goto(`${base}/demo/kanji/${encodeURIComponent("林")}?mode=play`, {
  waitUntil: "domcontentloaded",
});
await dismissAnnounce();
await page.getByRole("button", { name: /乗った/ }).waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: /乗った/ }).click();
await page.locator("button").filter({ hasText: /よみを見る/ }).first().click();
{
  const listenBtn = page.getByRole("button", { name: /を聞く/ });
  if (await listenBtn.count()) await listenBtn.first().click();
}
await page.locator("button").filter({ hasText: /掛け軸に置く/ }).first().click();
await page.getByRole("button", { name: /わかった/ }).click();
const untilShape = Date.now() + 25_000;
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
    await page.waitForTimeout(200);
    continue;
  }
  const choice = page.locator('[data-tour="choice-correct"]');
  if (await choice.count()) {
    await choice.click();
    const check = page.locator('[data-tour="check"]');
    if (await check.count()) await check.click();
    await page.waitForTimeout(200);
    continue;
  }
  await page.waitForTimeout(200);
}
if (!sawComponent) throw new Error("林 did not reach components");
for (let i = 0; i < 4; i++) {
  const piece = page.locator('[data-tour="component-next"]');
  if (!(await piece.count())) break;
  await piece.first().click();
  await page.waitForTimeout(500);
}
await page.waitForTimeout(700);
const hayashi = await dump("qa-kd-hayashi");
await shot("qa-kd-hayashi.png");
if (!/つぎへ|到着/.test(hayashi)) throw new Error(`林 parts did not complete:\n${hayashi}`);

if (errors.length) {
  writeFileSync(`${outDir}/qa-kd-console.txt`, errors.join("\n"));
  throw new Error(`console errors:\n${errors.join("\n")}`);
}

writeFileSync(`${outDir}/qa-kd-ok.txt`, "ok");
await browser.close();
console.log(JSON.stringify({ ok: true, errors: [] }));
