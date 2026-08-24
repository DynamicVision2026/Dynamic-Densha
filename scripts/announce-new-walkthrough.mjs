import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openFresh(path) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    locale: "ja-JP",
  });
  const requested = [];
  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/announce/") || u.includes("/audio/readings/")) requested.push(u);
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("densha.locale", "ja");
    localStorage.setItem("densha.demo.progress.v2", "{}");
    sessionStorage.removeItem("densha.lastStation");
  });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 25_000 });
  return { page, requested };
}

async function waitAnnounce(page, label) {
  try {
    await page.getByText("車内アナウンス").waitFor({ timeout: 20_000 });
  } catch (err) {
    const text = await page.locator("body").innerText();
    writeFileSync(`${outDir}/announce-fail-${label}.txt`, `${page.url()}\n\n${text}`);
    throw err;
  }
}

const spots = [
  { char: "子", grade: 1, must: ["子ども", "「子」"], mustNot: ["森林", "星空"], clip: "kodomo" },
  { char: "林", grade: 1, must: ["森林", "「林」"], mustNot: ["子ども", "星空"], clip: "shinrin-hayashi" },
  { char: "星", grade: 2, must: ["星空", "「星」"], mustNot: ["海辺", "雨雲"], clip: "hoshizora" },
  { char: "海", grade: 2, must: ["海辺", "「海」"], mustNot: ["星空", "雨雲"], clip: "umibe" },
  { char: "雲", grade: 2, must: ["雨雲", "「雲」"], mustNot: ["星空", "海辺", "漢字"], clip: "g-96f2" },
  { char: "漢", grade: 3, must: ["漢字", "「漢」"], mustNot: ["雨雲", "星空"], clip: "g-6f22" },
];

for (const spot of spots) {
  const { page, requested } = await openFresh(
    `/demo/kanji/${encodeURIComponent(spot.char)}?grade=${spot.grade}`,
  );
  await waitAnnounce(page, spot.char);
  const text = await page.locator("body").innerText();
  writeFileSync(`${outDir}/announce-${spot.char}.txt`, `${page.url()}\n\n${text}`);
  for (const m of spot.must) {
    if (!text.includes(m)) throw new Error(`${spot.char} missing ${m}:\n${text}`);
  }
  for (const n of spot.mustNot) {
    if (text.includes(n)) throw new Error(`${spot.char} reused ${n}:\n${text}`);
  }
  await page.locator('[data-tour="announce-hear"]').waitFor({ timeout: 5_000 });
  await page.waitForTimeout(600);
  const hit = requested.some((u) => u.includes(`${spot.clip}.mp3`));
  if (!hit) throw new Error(`${spot.char} no clip ${spot.clip}:\n${requested.join("\n")}`);
  await page.close();
}

{
  const { page } = await openFresh(`/demo/kanji/${encodeURIComponent("雲")}?grade=2&mode=look`);
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  if (text.includes("車内アナウンス")) throw new Error(`みてみる played announce:\n${text}`);
  await page.close();
}

{
  const { page } = await openFresh(`/demo/kanji/${encodeURIComponent("子")}?grade=1`);
  await waitAnnounce(page, "hear");
  await page.locator('[data-tour="announce-hear"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-tour="announce-dismiss"]').click();
  await page.waitForTimeout(300);
  const after = await page.locator("body").innerText();
  if (after.includes("車内アナウンス")) throw new Error("dismissed announce remained");
  await page.close();
}

await browser.close();
console.log("announce G2–G6 walkthrough ok");
