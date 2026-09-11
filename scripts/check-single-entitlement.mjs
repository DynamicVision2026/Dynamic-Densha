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
 *
 * The multi-child model added a SECOND thing entitlement is computed from --
 * household.covered_child_id, which decides whether an annual pass reaches a
 * particular child -- so this gate now guards that the same way. Coverage is
 * compared in exactly one place (entitlementFor, in entitlement.ts) and read
 * from the database in exactly one place (server/coverage.ts's readCoverage).
 * Anywhere else, a `coveredChildId === childId` is a second copy of the ride
 * rule, which is the whole failure mode this file exists to prevent: the
 * first copy gets fixed and the second keeps letting an uncovered sibling
 * ride.
 *
 * The exemption list GREW for the new signature; no check was loosened. A
 * file is exempt because it IS the state machine, never because adding it
 * was easier than calling the function.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXEMPT = new Set([
  "src/lib/entitlement.ts",
  "src/lib/subscription-derive.ts",
  "src/lib/server/subscription.ts",
]);

/**
 * Files allowed to mention coverage at all. Narrower than EXEMPT on purpose:
 *   - entitlement.ts   computes the rule (entitlementFor)
 *   - server/coverage.ts reads the column and hands it to that rule
 *   - server/pass.ts    assigns it, and must read it to refuse a no-op
 *   - server/children.ts auto-assigns on an annual household's first child
 *   - server/subscription.ts clears it on the upgrade to a buyout
 *   - components/pass-assignment-card.tsx is the one UI that may: it renders
 *     WHICH BUTTON IS SELECTED in the parent's own chooser, which is a
 *     display question, not a ride decision. It is parent-surface-only and
 *     imported by nothing on a child surface. This is the only exemption
 *     here that is not part of the state machine, and it is the one worth
 *     re-reading if it ever starts deciding anything.
 */
const COVERAGE_EXEMPT = new Set([
  "src/lib/entitlement.ts",
  "src/lib/server/coverage.ts",
  "src/lib/server/pass.ts",
  "src/lib/server/children.ts",
  "src/lib/server/subscription.ts",
  "src/components/pass-assignment-card.tsx",
]);

/**
 * A second copy of "does this pass reach this child". Matches the identifier
 * on EITHER side of the operator -- `coveredChildId === childId` and
 * `child.id === assignment.coveredChildId` are the same comparison, and a
 * gate that only caught one spelling would be trivially, accidentally
 * sidestepped.
 */
const COVERAGE_ID = String.raw`covered(_c|C)hild(_i|I)d`;
const BAD_COVERAGE = new RegExp(
  `(\\b${COVERAGE_ID}\\s*(===|==|!==|!=))|((===|==|!==|!=)\\s*[A-Za-z_$][\\w$.]*\\b${COVERAGE_ID}\\b)`,
);

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
    if (BAD.test(line)) errors.push(`${rel}:${i + 1}  [state]  ${line.trim().slice(0, 110)}`);
  });
}

for (const file of walk(join(ROOT, "src"))) {
  const rel = relative(ROOT, file);
  if (COVERAGE_EXEMPT.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BAD_COVERAGE.test(line)) errors.push(`${rel}:${i + 1}  [coverage]  ${line.trim().slice(0, 110)}`);
  });
}

if (errors.length) {
  console.error(
    "single-entitlement failed -- entitlement was recomputed outside the one function that owns it:",
  );
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("single-entitlement ok (state literals + pass coverage)");
