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
  if (sessionStorage.getItem("densha.s3init")) return;
  sessionStorage.setItem("densha.s3init", "1");
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
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      return;
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(400);
    }
  }
  throw lastErr;
};

const dismissAnnounce = async () => {
  const btn = page.locator('[data-tour="announce-dismiss"]');
  try {
    await btn.waitFor({ timeout: 2500 });
    await btn.click();
    await page.waitForTimeout(200);
  } catch {
    /* none */
  }
};

const snapshotLamps = async () => {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      return await page.evaluate(() => {
        const raw = localStorage.getItem("densha.demo.progress.v2");
        if (!raw) return {};
        const all = JSON.parse(raw);
        const out = {};
        for (const [k, v] of Object.entries(all)) {
          out[k] = { status: v.status, lights: v.lights };
        }
        return out;
      });
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(400);
    }
  }
  throw lastErr ?? new Error("snapshotLamps failed");
};

await go("/demo");
await page.getByText("時刻表").first().waitFor({ timeout: 15_000 });
await page.waitForURL(/grade=/, { timeout: 8_000 });
const home = await dump("thick-s3-home");
if (!home.includes("今週の のぞき")) {
  throw new Error(`T6 peek missing on timetable:\n${home}`);
}
const peek = page.locator("[data-week-peek]");
if ((await peek.count()) !== 1) {
  throw new Error(`T6 expected a single peek card, got ${await peek.count()}`);
}

const progressBefore = await snapshotLamps();
await page.locator('[data-tour="week-peek"]').click();
await page.waitForURL(/\/demo\/(map|workshop)/, { timeout: 8_000 });
const peekUrl = page.url();
const onMap = peekUrl.includes("/demo/map");
const onWorkshop = peekUrl.includes("/demo/workshop");
if (onMap) {
  await page.locator('[data-line-focus="true"]').waitFor({ timeout: 8_000 });
}
if (onWorkshop) {
  await page.getByText("音の家族").first().waitFor({ timeout: 8_000 });
}
const peekBody = await dump("thick-s3-peek");
if (!peekUrl.includes("grade=1")) {
  throw new Error(`T6 peek dropped activeGrade:\n${peekUrl}`);
}
if (!onMap && !onWorkshop) {
  throw new Error(`T6 peek did not open map or workshop:\n${peekUrl}\n${peekBody}`);
}
if (onMap && !peekBody.includes("手の線") && !peekBody.includes("木の線")) {
  throw new Error(`T6 map peek missing a line:\n${peekBody}`);
}
if (onWorkshop && !peekBody.includes("音の家族") && !peekBody.includes("セイの家族")) {
  throw new Error(`T6 workshop peek missing family:\n${peekBody}`);
}
const progressAfterPeek = await snapshotLamps();
if (JSON.stringify(progressAfterPeek) !== JSON.stringify(progressBefore)) {
  throw new Error(
    `T6 opening peek changed lamps/status:\n${JSON.stringify(progressBefore)}\n${JSON.stringify(progressAfterPeek)}`,
  );
}

await page.waitForTimeout(300);
await go("/demo/workshop?grade=1&family=sei_ao");
await page.getByText("音の家族").first().waitFor({ timeout: 10_000 });
const workshop = await dump("thick-s3-workshop");
if (!workshop.includes("セイの家族")) {
  throw new Error(`T6 workshop family not selected:\n${workshop}`);
}
if (!page.url().includes("grade=1")) {
  throw new Error(`T6 workshop dropped grade:\n${page.url()}`);
}

await go("/demo/parent");
await page.getByText("今週おしえたこと").waitFor({ timeout: 10_000 });
const parentJa = await dump("thick-s3-parent-ja");
if (!parentJa.includes("今週おしえたこと")) {
  throw new Error(`T5 missing taught block:\n${parentJa}`);
}
if (parentJa.includes("まだ今週のきろくがありません")) {
  throw new Error(`T5 seed week should not be empty:\n${parentJa}`);
}
if (!parentJa.includes("一") || !parentJa.includes("雨") || !parentJa.includes("円")) {
  throw new Error(`T5 seed facts missing:\n${parentJa}`);
}
if (!parentJa.includes("その日の「だいたい」は確認まえ")) {
  throw new Error(`T5 honesty line missing:\n${parentJa}`);
}

await page.getByLabel("言語").or(page.getByLabel("Language")).click();
await page.getByRole("option", { name: /English/ }).or(page.getByText("English")).first().click();
await page.waitForTimeout(300);
const parentEn = await dump("thick-s3-parent-en");
if (!parentEn.includes("What we taught this week")) {
  throw new Error(`T5 EN copy missing:\n${parentEn}`);
}

await page.evaluate(() => localStorage.setItem("densha.locale", "ja"));

await go(`/demo/kanji/${encodeURIComponent("林")}?mode=play&grade=1`);
await dismissAnnounce();
const ride = page.getByRole("button", { name: /乗った/ });
await ride.waitFor({ timeout: 15_000 });
await ride.click({ timeout: 8_000 });
await page.getByText("わかる").waitFor();
await page.locator("button").filter({ hasText: /よみを見る/ }).first().click();
{
  const listen = page.getByRole("button", { name: /を聞く/ });
  if (await listen.count()) await listen.first().click();
  else {
    const ack = page.getByRole("button", { name: /これでいい/ });
    if (await ack.count()) await ack.click();
  }
}
await page.locator("button").filter({ hasText: /掛け軸に置く/ }).first().click();
await page.getByRole("button", { name: /わかった/ }).click();

const untilShape = Date.now() + 40_000;
let sawHint = false;
while (Date.now() < untilShape) {
  const text = await page.locator("body").innerText();
  if (text.includes("き が ふたつ") || (await page.locator("[data-shape-hint]").count())) {
    sawHint = true;
    break;
  }
  const nextBtn = page.locator('[data-tour="next"]');
  if (await nextBtn.count()) {
    await nextBtn.click();
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
if (!sawHint) {
  const fail = await dump("thick-s3-hayashi-fail");
  throw new Error(`T2 林 never showed structure hint:\n${fail}`);
}
const before = await dump("thick-s3-hayashi-hint");
if (!before.includes("き が ふたつ")) {
  throw new Error(`T2 林 hint copy missing:\n${before}`);
}

for (let i = 0; i < 4; i++) {
  const piece = page.locator('[data-tour="component-next"]');
  if (!(await piece.count())) break;
  await piece.first().click();
  await page.waitForTimeout(550);
}
await page.waitForTimeout(900);
await page.locator("[data-shape-confirm]").waitFor({ timeout: 5_000 });
const after = await dump("thick-s3-hayashi-confirm");
if (!after.includes("木と木で 林")) {
  throw new Error(`T2 林 confirm missing:\n${after}`);
}
const next = page.locator('[data-tour="next"]');
if (await next.count()) await next.click();
await page.waitForTimeout(400);

await go("/demo/parent");
await page.getByText("今週おしえたこと").waitFor({ timeout: 10_000 });
const parentAfter = await dump("thick-s3-parent-after");
if (!parentAfter.includes("林")) {
  throw new Error(`T5 after 林 ride missing 林:\n${parentAfter}`);
}
if (!parentAfter.includes("木と木で 林") && !parentAfter.includes("森林")) {
  throw new Error(`T5 after 林 ride missing teaching fact:\n${parentAfter}`);
}

await go("/demo");
await page.getByText("時刻表").first().waitFor({ timeout: 10_000 });
const homeAgain = await dump("thick-s3-home-after");
if (homeAgain.includes("遅れ") && /overdue/i.test(homeAgain)) {
  throw new Error(`S2 lateness copy regress:\n${homeAgain}`);
}

if (errors.length) {
  writeFileSync(`${outDir}/thick-s3-errors.txt`, errors.join("\n"));
}
writeFileSync(`${outDir}/thick-s3-ok.txt`, "ok");
await browser.close();
console.log("thick-s3 walkthrough ok");
