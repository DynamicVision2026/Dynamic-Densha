#!/usr/bin/env node
/**
 * The mastery/echo evaluation path must obtain "now" through Clock
 * (src/lib/server/clock.ts) and nowhere else, so a test can drive real
 * 20h/168h delays in milliseconds instead of waiting them out live -- see
 * scripts/echo-clock-sequence.test.ts and the engineering ticket this
 * script belongs to.
 *
 * Fails if `new Date(` or `Date.now(` appears anywhere in:
 *   - src/lib/progress-eval.ts (the engine)
 *   - src/lib/server/progress-write.ts (the three scoring mutations)
 * outside src/lib/server/clock.ts itself (where systemClock legitimately
 * reads the system clock) or any test file.
 *
 * This is a narrower net than "the whole progress subsystem" on purpose:
 * progress.ts's read-only views (getHomeState, the parent report, the map)
 * are not part of the risk this gate exists for -- see the ticket's own
 * §0 -- and keep reading the system clock directly, same as before.
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
// A bare `new Date()` or `Date.now()` reads the system clock. `new Date(x)`
// with an argument does not -- it's arithmetic on a timestamp someone else
// (a Clock) already produced, which is exactly what this file is full of and
// exactly what must stay legal.
const BAD = /\bnew Date\(\s*\)|\bDate\.now\(/;

const GUARDED_FILES = [
  "src/lib/progress-eval.ts",
  "src/lib/server/progress-write.ts",
];

// Strip block and line comments first, so this script's own doc-comments
// (which quote the very patterns it looks for) never trip the gate.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const errors = [];

for (const rel of GUARDED_FILES) {
  const raw = readFileSync(ROOT + rel, "utf8");
  const lines = stripComments(raw).split("\n");
  lines.forEach((line, i) => {
    if (BAD.test(line)) {
      errors.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (errors.length) {
  console.error("check-clock-single-source failed -- direct clock read outside clock.ts:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("check-clock-single-source ok");
