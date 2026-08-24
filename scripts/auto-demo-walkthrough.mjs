import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8080";
mkdirSync("/workspace/screenshots", { recursive: true });

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
await page.emulateMedia({ reducedMotion: "reduce" });
await page.addInitScript(() => localStorage.setItem("densha.locale", "ja"));

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.locator("[data-tour=watch-demo]").click();
await page.getByText(/おわり|That’s the ride|演示结束|演示結束/).waitFor({ timeout: 90_000 });

const text = await page.locator("body").innerText();
writeFileSync("/workspace/screenshots/auto-demo.txt", `${page.url()}\n\n${text}`);

try {
  await page.screenshot({
    path: "/workspace/screenshots/auto-demo-done.png",
    clip: { x: 0, y: 0, width: 1280, height: 800 },
    timeout: 8_000,
  });
} catch {
  /* ignore */
}

await browser.close();
const fatal = errors.filter((e) => !/hydration|Hydration|Download the React DevTools/i.test(e));
console.log(JSON.stringify({ ok: fatal.length === 0, errors: fatal }, null, 2));
if (fatal.length) process.exit(1);
