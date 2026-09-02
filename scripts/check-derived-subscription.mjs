#!/usr/bin/env node
/**
 * Commerce spec §7.1/§13 rule 5: `subscription` is derived. Nothing writes
 * to it directly -- not webhooks, not admins, not migrations after the
 * initial backfill. State and dates are computed from billing_event +
 * admin_action; writing to `subscription` any other way is the exact bug
 * this rule exists to prevent: an admin extends a trial by editing the row,
 * a routine webhook retry re-derives from the event log and silently
 * reverts it, and nobody sees an error anywhere.
 *
 * Fail if `insert into subscription` or `update subscription` appears in
 * src/ outside src/lib/server/subscription.ts (the one recompute-and-cache
 * function) and src/lib/server/household.ts (which seeds the very first
 * row at household creation -- there is no event log yet to derive from).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXEMPT = new Set([
  "src/lib/server/subscription.ts",
  "src/lib/server/household.ts",
]);
const BAD = /\b(insert\s+into|update)\s+subscription\b/i;

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
  console.error("derived-subscription failed -- a write to `subscription` was found outside the recompute function:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("derived-subscription ok");
