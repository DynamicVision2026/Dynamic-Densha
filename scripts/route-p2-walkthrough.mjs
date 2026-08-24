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
  if (sessionStorage.getItem("densha.routep2.init")) return;
  sessionStorage.setItem("densha.routep2.init", "1");
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

await go("/demo/parent");
await page.locator("[data-grade-rollover]").waitFor({ timeout: 12_000 });
const parent = await dump("route-p2-parent");
if (!parent.includes("学年をあがる")) throw new Error(`rollover control missing:\n${parent}`);
if (!parent.includes("これからの見とおし")) throw new Error("forward missing");
if (!/よそう|ペース|もうすこし/.test(parent)) throw new Error(`arrival copy missing:\n${parent}`);
if (/will finish|までに終わることを約束|weeks behind/i.test(parent)) {
  throw new Error(`guarantee/behind copy:\n${parent}`);
}

await page.getByRole("button", { name: "学年をあがる" }).click({ force: true });
await page.getByRole("button", { name: "まだ" }).click({ force: true });
await page.getByRole("button", { name: "学年をあがる" }).waitFor({ timeout: 5_000 });
await page.waitForTimeout(200);
const stayed = await dump("route-p2-stay");
if (stayed.includes("これまでの せんろ")) throw new Error("history appeared without confirm");

await page.getByRole("button", { name: "学年をあがる" }).click({ force: true });
await page.getByRole("button", { name: "すすむ" }).click({ force: true });
await page.getByText("これまでの せんろ").waitFor({ timeout: 8_000 });
const after = await dump("route-p2-after");
if (!after.includes("2年生") && !after.includes("2年")) {
  throw new Error(`profile did not move to G2:\n${after}`);
}
if (!after.includes("一")) throw new Error("history/progress lost 一");

const snap = await page.evaluate(() => {
  const raw = localStorage.getItem("densha.demo.progress.v2");
  if (!raw) return {};
  const all = JSON.parse(raw);
  const out = {};
  for (const [k, v] of Object.entries(all)) out[k] = v.status;
  return out;
});
if (snap["一"] !== "perfect") throw new Error("rollover wiped 一");

await go("/demo");
await page.locator("[data-departure-board]").waitFor({ timeout: 12_000 });
const home = await dump("route-p2-home");
if (!home.includes("発車標")) throw new Error(`board missing after rollover:\n${home}`);
if (/遅れ|behind|追いつき/i.test(home)) throw new Error(`child behind copy:\n${home}`);
if (/あたらしい えき[\s\S]{0,80}一/.test(home)) {
  throw new Error(`G1 leftover dumped as new this week:\n${home}`);
}
if (home.includes("よそう") && home.includes("全駅到着")) {
  throw new Error("child saw parent projection");
}

if (errors.length) writeFileSync(`${outDir}/route-p2-errors.txt`, errors.join("\n"));
await browser.close();
console.log("route-p2 walkthrough ok");
