#!/usr/bin/env node
/**
 * T3: ticket chrome is the same for guest and account.
 * Fail if a /demo path guard wraps SessionStub, DepartureTicket, or HomeScreenPrompt.
 * Child ride must not grow a ほぞんする save-to-account prompt.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const GUARDS = [
  'hrefHome === "/demo"',
  "hrefHome === '/demo'",
  'hrefBase === "/demo"',
  "hrefBase === '/demo'",
  'pathname === "/demo"',
  "pathname === '/demo'",
];

const TICKET_OPEN = ["<SessionStub", "<DepartureTicket", "<HomeScreenPrompt"];
const TICKET_FILES = ["session-stub.tsx", "departure-ticket.tsx"];
const WINDOW = 280;

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx|js|mjs|md)$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const errors = [];

function scanSrc() {
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    const rel = relative(ROOT, file);
    const base = file.split("/").pop();
    if (TICKET_FILES.includes(base)) {
      for (const g of GUARDS) {
        if (src.includes(g)) {
          errors.push(`${rel}: path guard inside ticket chrome (${g})`);
        }
      }
    }
    for (const g of GUARDS) {
      let from = 0;
      while (from < src.length) {
        const i = src.indexOf(g, from);
        if (i < 0) break;
        const lo = Math.max(0, i - WINDOW);
        const hi = Math.min(src.length, i + g.length + WINDOW);
        const around = src.slice(lo, hi);
        if (TICKET_OPEN.some((t) => around.includes(t))) {
          errors.push(`${rel}: path guard wraps ticket chrome (${g})`);
        }
        from = i + g.length;
      }
    }
  }
}

function scanChildRideSave() {
  const dir = join(SRC, "components");
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    if (src.includes("ほぞんする")) {
      errors.push(`${relative(ROOT, file)}: child ride must not contain ほぞんする`);
    }
  }
}

function scanFakeEngine() {
  const importHit = /from\s+['"]packages\/engine(?:\/[^'"]*)?['"]|require\(\s*['"]packages\/engine/;
  for (const dir of ["src", "scripts"]) {
    const root = join(ROOT, dir);
    for (const file of walk(root)) {
      if (file.endsWith("check-ticket-path-guard.mjs")) continue;
      const src = readFileSync(file, "utf8");
      if (importHit.test(src)) {
        errors.push(`${relative(ROOT, file)}: do not import packages/engine`);
      }
    }
  }
  try {
    const names = readdirSync(join(ROOT, "packages"));
    if (names.length >= 0) errors.push("packages/: directory must not exist");
  } catch {
    /* no packages/ dir — required */
  }
}

scanSrc();
scanChildRideSave();
scanFakeEngine();

if (errors.length) {
  console.error("ticket-path-guard failed:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("ticket-path-guard ok");
