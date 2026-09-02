#!/usr/bin/env node
/**
 * Commerce spec §3.1/§13 rule 4: entitlement() is one function with one call
 * site per surface. Four prior defects in this project came from duplicated
 * logic existing twice (see check-echo-eligibility-single-source.mjs for
 * the same class of bug in the echo engine); billing's failure mode is a
 * family charged and locked out simultaneously, which is worse.
 *
 * Fail if any subscription-state literal comparison
 * (state === 'lapsed' / 'active' / 'trial' / 'cancelled' / 'guest', in
 * either quote style) appears in src/ outside the files that legitimately
 * ARE the state machine:
 *   - src/lib/entitlement.ts          the one entitlement function
 *   - src/lib/subscription-derive.ts  the one state-derivation fold
 *   - src/lib/server/subscription.ts  its thin DB read/cache wrapper
 * Everywhere else (routes, components, server functions) must call
 * entitlement() and branch on canRide/canView, never on state directly.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXEMPT = new Set([
  "src/lib/entitlement.ts",
  "src/lib/subscription-derive.ts",
  "src/lib/server/subscription.ts",
]);

const STATES = ["guest", "trial", "active", "lapsed", "cancelled"];
const BAD = new RegExp(`\\bstate\\s*(===|==)\\s*['"](${STATES.join("|")})['"]`);

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const errors = [];
for (const file of walk(join(ROOT, "src"))) {
  const rel = relative(ROOT, file);
  if (EXEMPT.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BAD.test(line)) errors.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}

if (errors.length) {
  console.error("single-entitlement failed -- a subscription state literal was compared outside entitlement.ts:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("single-entitlement ok");
