#!/usr/bin/env node
/**
 * T1: echo delay arithmetic stays in the engine, not UI or demo adapters.
 * Fail if src/components or src/lib/demo-progress.ts mention
 * echo_delay_hours / echo_second_delay_hours / echoFirstDelayHours.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BAD = /echo_delay_hours|echo_second_delay_hours|echoFirstDelayHours/;
const errors = [];

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

for (const file of walk(join(ROOT, "src/components"))) {
  const src = readFileSync(file, "utf8");
  if (BAD.test(src)) errors.push(`${relative(ROOT, file)}: echo delay must not live in UI`);
}

const demo = join(ROOT, "src/lib/demo-progress.ts");
const demoSrc = readFileSync(demo, "utf8");
if (BAD.test(demoSrc)) errors.push("src/lib/demo-progress.ts: echo delay must not be arithmetic here");

if (errors.length) {
  console.error("echo-eligibility-single-source failed:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("echo-eligibility-single-source ok");
