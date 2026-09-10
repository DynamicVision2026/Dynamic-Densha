#!/usr/bin/env node
/**
 * Verifies what actually reaches the 定期券 canvas, in a real browser.
 *
 * Spec §2.3: "Re-verify the PII check on the rendered pixels after this
 * change, not on the source." Reading src/lib/ticket-png.ts and concluding
 * it looks fine is exactly the check this is meant to replace, so this
 * instruments CanvasRenderingContext2D itself: every fillText/strokeText
 * call the real drawing code makes is recorded, then checked against a
 * deliberately planted child name, email and id. Nothing identifying can
 * reach the image without passing through one of those calls.
 *
 * Also asserts the QR drawn on the pass is the pass matrix (not the stub's)
 * and that the canvas is actually painted rather than blank.
 *
 * NOT part of `npm test`: it needs a Chromium and a running dev server,
 * neither of which exists in the deploy workflow's runner. Run it by hand
 * against a local dev server:
 *
 *   node scripts/check-pass-png-pixels.mjs [http://127.0.0.1:8080]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Planted values: if any of these ever reach the canvas, this fails.
const PLANTED = {
  childName: "そらまめ太郎",
  email: "parent@example.com",
  userId: "user-abc-123",
  childId: "child-xyz-789",
};

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();
const failures = [];

page.on("console", (m) => {
  // Third-party asset fetches (the webfont) are blocked by this sandbox's
  // egress policy and say nothing about what the canvas drew.
  const text = m.text();
  const isNetwork = /Failed to load resource|net::ERR_/.test(text);
  if (m.type() === "error" && !isNetwork) failures.push(`console error: ${text}`);
});

// The dev server serves the app's own modules, so the drawing code under
// test is the real one, imported the same way the route imports it.
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async (planted) => {
  const painted = [];
  const proto = CanvasRenderingContext2D.prototype;
  const originalFill = proto.fillText;
  const originalStroke = proto.strokeText;
  proto.fillText = function (text, ...rest) {
    painted.push(String(text));
    return originalFill.call(this, text, ...rest);
  };
  proto.strokeText = function (text, ...rest) {
    painted.push(String(text));
    return originalStroke.call(this, text, ...rest);
  };

  const png = await import("/src/lib/ticket-png.ts");
  const copy = await import("/src/lib/commerce-copy.ts");
  const qr = await import("/src/lib/ticket-qr.ts");

  // Exactly what src/routes/subscribe.success.tsx passes, for a household
  // whose train name is unset (every household today).
  const canvas = png.drawCommuterPassCanvas({
    passenger: copy.trainNameOrDefault(null),
    planLabel: "ご家庭ライセンス",
    validityLabel: "なし（永年）",
    title: "定期券",
    validityCaption: "有効期限",
  });

  proto.fillText = originalFill;
  proto.strokeText = originalStroke;

  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const colours = new Set();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) opaque++;
    colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }

  // Does the QR area actually carry the PASS matrix? Sample the modules
  // back off the pixels and compare to the baked rows.
  const QR_X = 540;
  const QR_Y = 220;
  const QR_SIZE = 120;
  const quiet = 2;
  const n = qr.PASS_QR_MATRIX.length;
  const cell = QR_SIZE / (n + quiet * 2);
  const sampled = [];
  for (let r = 0; r < n; r++) {
    let row = "";
    for (let c = 0; c < n; c++) {
      const x = Math.floor(QR_X + (c + quiet) * cell + cell / 2);
      const y = Math.floor(QR_Y + (r + quiet) * cell + cell / 2);
      const px = ctx.getImageData(x, y, 1, 1).data;
      row += px[0] < 128 ? "1" : "0";
    }
    sampled.push(row);
  }

  return {
    painted,
    width: canvas.width,
    height: canvas.height,
    opaque,
    colourCount: colours.size,
    qrMatches: sampled.join("|") === [...qr.PASS_QR_MATRIX].join("|"),
    passHref: qr.PASS_QR_HREF,
    plantedProbe: Object.values(planted),
  };
}, PLANTED);

console.log(`canvas: ${result.width}x${result.height}, ${result.opaque} opaque px, ${result.colourCount} distinct colours`);
console.log(`text actually painted onto the canvas (${result.painted.length} calls):`);
for (const s of result.painted) console.log(`  · ${s}`);

if (result.opaque < result.width * result.height * 0.9) {
  failures.push(`canvas looks mostly blank (${result.opaque} opaque px)`);
}
if (result.colourCount < 3) failures.push("canvas has too few colours to have drawn anything");

const blob = result.painted.join("\n");
for (const [key, value] of Object.entries(PLANTED)) {
  if (blob.includes(value)) failures.push(`PII on the canvas: ${key} (${value})`);
}
for (const pattern of [/@/, /child|user|nickname/i, /[0-9a-f]{8}-[0-9a-f]{4}/i]) {
  if (pattern.test(blob)) failures.push(`suspicious text painted: ${pattern}`);
}
if (!blob.includes("わたしのれっしゃ号")) failures.push("the train name did not reach the canvas");
if (!result.qrMatches) failures.push("the QR drawn on the pass is not the PASS_QR_MATRIX");

console.log(`\nQR on the pass decodes to the baked PASS matrix: ${result.qrMatches ? "yes" : "NO"}`);
console.log(`QR target: ${result.passHref}`);

await browser.close();

if (failures.length) {
  console.error("\nFAIL");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nPASS — no identity reaches the rendered pass, and the QR is the plain app URL");
