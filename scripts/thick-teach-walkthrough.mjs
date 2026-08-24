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
  localStorage.clear();
  localStorage.setItem("densha.locale", "ja");
});

const dump = async (name) => {
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/${name}.txt`, `${page.url()}\n\n${text}`);
  return text;
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

await page.goto(`${base}/demo`, { waitUntil: "domcontentloaded" });
await page.getByText("時刻表").first().waitFor({ timeout: 15_000 });
const home = await dump("thick-teach-home");
if (!home.includes("あした") && !home.includes("きょう") && !home.includes("日後")) {
  throw new Error(`T4 missing next-arrival on timetable:\n${home}`);
}
if (/遅れ|overdue/i.test(home)) {
  throw new Error(`T4 used lateness copy:\n${home}`);
}

await page.goto(`${base}/demo/kanji/${encodeURIComponent("王")}?mode=play`, {
  waitUntil: "domcontentloaded",
});
await dismissAnnounce();
const ride = page.getByRole("button", { name: /乗った/ });
await ride.waitFor({ timeout: 15_000 });
if (!(await ride.isDisabled())) {
  throw new Error("T1 乗った should start disabled during dwell");
}
await ride.click({ timeout: 8_000 });
await page.getByText("わかる").waitFor();
const understood = page.getByRole("button", { name: /わかった/ });
await page.locator("button").filter({ hasText: /よみを見る/ }).first().click();
if (await understood.isDisabled()) {
  /* expected until listen + dwell */
}
const listen = page.getByRole("button", { name: /を聞く/ });
if (await listen.count()) await listen.first().click();
else {
  const ack = page.getByRole("button", { name: /これでいい/ });
  if (await ack.count()) await ack.click();
}
await page.locator("button").filter({ hasText: /掛け軸に置く/ }).first().click();
await understood.click({ timeout: 8_000 });
await page.getByText("この字の よみは？").or(page.getByText("この字の いみは？")).first().waitFor({ timeout: 10_000 });
await dump("thick-teach-wang-practice");

await page.goto(`${base}/demo/kanji/${encodeURIComponent("右")}?mode=play`, {
  waitUntil: "domcontentloaded",
});
await page.getByText("残響").waitFor({ timeout: 10_000 });
const echo = await dump("thick-teach-migi-strip");
const banner = page.locator("[data-echo-teach]").first();
const debug = {
  teach: await banner.getAttribute("data-echo-teach"),
  now: await banner.getAttribute("data-echo-now"),
  skip: await banner.getAttribute("data-echo-skip"),
  surface: await banner.getAttribute("data-echo-surface"),
  stale: await banner.getAttribute("data-echo-stale"),
  tour: await banner.getAttribute("data-tour-active"),
  taught: await page.evaluate(() => localStorage.getItem("densha.echo-taught.v1")),
};
writeFileSync(
  `${outDir}/thick-teach-migi-debug.txt`,
  `${JSON.stringify(debug, null, 2)}\n\n${echo}`,
);
if (!echo.includes("右手") && !echo.includes("みぎ")) {
  throw new Error(`T3 echo teach-strip missing word/reading:\n${echo}`);
}
if (!echo.includes("いみ") && !echo.includes("ことば")) {
  throw new Error(`T3 echo teach-strip missing meaning:\n${echo}`);
}
const go = page.locator('[data-tour="echo-teach-go"]');
await go.waitFor({ timeout: 8_000 });
await go.click({ timeout: 8_000 });
await page.locator('[data-tour="choice-correct"], [data-tour="stroke-next"], [data-tour="component-next"]').first().waitFor({ timeout: 10_000 });
await dump("thick-teach-migi-quiz");

if (errors.length) throw new Error(errors.join("\n"));
writeFileSync(`${outDir}/thick-teach-ok.txt`, "ok");
await browser.close();
console.log(JSON.stringify({ ok: true }));
