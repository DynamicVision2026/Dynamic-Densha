#!/usr/bin/env node
/**
 * Renders the home-screen icons from the same geometry as public/favicon.svg,
 * so the icon a parent taps is the mark they already saw in the tab.
 *
 * A build tool, run by hand — the PNGs it writes are committed. No image
 * dependency: this rasterises a handful of rounded rectangles and circles
 * with 4x4 supersampling and writes the PNG itself (zlib is in Node). That
 * is far less machinery than it sounds, and it beats committing binaries
 * nobody can regenerate.
 *
 *   node scripts/gen-pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const CREAM = [0xf4, 0xef, 0xe4];
const VERMILION = [0xc4, 0x5c, 0x48];
const INK = [0x1c, 0x19, 0x16];

/** The favicon's own shapes, in its 100x100 viewBox. */
const SHAPES = [
  { kind: "rect", x: 26, y: 16, w: 14, h: 22, r: 3, fill: VERMILION },
  { kind: "rect", x: 16, y: 38, w: 44, h: 28, r: 14, fill: VERMILION },
  { kind: "rect", x: 52, y: 24, w: 32, h: 42, r: 5, fill: VERMILION },
  { kind: "rect", x: 58, y: 30, w: 20, h: 14, r: 2, fill: CREAM },
  { kind: "circle", cx: 36, cy: 74, r: 12, fill: INK },
  { kind: "circle", cx: 70, cy: 74, r: 12, fill: INK },
];

function insideRoundRect(px, py, s) {
  const { x, y, w, h, r } = s;
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r || (px >= x + r && px <= x + w - r) || (py >= y + r && py <= y + h - r);
}

function insideCircle(px, py, s) {
  const dx = px - s.cx;
  const dy = py - s.cy;
  return dx * dx + dy * dy <= s.r * s.r;
}

/**
 * @param size    output edge in pixels
 * @param inset   fraction of the canvas the artwork occupies (maskable icons
 *                pull it in so a circular crop can't clip the train)
 * @param corner  background corner radius, in viewBox units (0 = full bleed)
 */
function render(size, { inset = 1, corner = 20 } = {}) {
  const SS = 4; // supersampling factor per axis
  const px = Buffer.alloc(size * size * 4);
  const scale = size / 100;
  const artScale = scale * inset;
  const offset = (size - 100 * artScale) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // Background, in canvas space so a full-bleed maskable icon has no
          // transparent corners for a launcher to mask into nothing.
          const bgX = fx / scale;
          const bgY = fy / scale;
          let colour = null;
          let alpha = 0;
          if (
            corner === 0 ||
            insideRoundRect(bgX, bgY, { x: 0, y: 0, w: 100, h: 100, r: corner })
          ) {
            colour = CREAM;
            alpha = 255;
          }
          // Artwork, in (possibly inset) art space.
          const ax = (fx - offset) / artScale;
          const ay = (fy - offset) / artScale;
          for (const s of SHAPES) {
            const hit = s.kind === "rect" ? insideRoundRect(ax, ay, s) : insideCircle(ax, ay, s);
            if (hit) {
              colour = s.fill;
              alpha = 255;
            }
          }
          if (colour) {
            acc[0] += colour[0];
            acc[1] += colour[1];
            acc[2] += colour[2];
            acc[3] += alpha;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const a = acc[3] / n;
      // Premultiplied average, un-premultiplied back out for the PNG.
      px[i] = a > 0 ? Math.round(acc[0] / n / (a / 255)) : 0;
      px[i + 1] = a > 0 ? Math.round(acc[1] / n / (a / 255)) : 0;
      px[i + 2] = a > 0 ? Math.round(acc[2] / n / (a / 255)) : 0;
      px[i + 3] = Math.round(a);
    }
  }
  return px;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const OUTPUTS = [
  // apple-touch-icon: iOS applies its own rounding and ignores transparency,
  // so this is full bleed and square.
  { file: "public/icon-180.png", size: 180, opts: { corner: 0 } },
  { file: "public/icon-192.png", size: 192, opts: { corner: 20 } },
  { file: "public/icon-512.png", size: 512, opts: { corner: 20 } },
  // Maskable: artwork inside the central safe zone, background full bleed.
  { file: "public/icon-maskable-512.png", size: 512, opts: { corner: 0, inset: 0.62 } },
];

for (const { file, size, opts } of OUTPUTS) {
  writeFileSync(file, encodePng(size, render(size, opts)));
  console.log(`wrote ${file} (${size}x${size})`);
}
