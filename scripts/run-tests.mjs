#!/usr/bin/env node
/**
 * Runs every test stage independently and reports on all of them, instead of
 * chaining with `&&` (where one early failure silently skips every later
 * stage — including the entire TypeScript test battery — while `npm test`
 * still prints something that looks like normal output).
 *
 * Exits 0 only if every stage passed. A failing stage does not stop the rest
 * from running; the final summary names every stage and its status.
 */
import { spawnSync } from "node:child_process";

const TS_TESTS = [
  "scripts/progress-eval.test.ts",
  "scripts/items.test.ts",
  "scripts/readings.test.ts",
  "scripts/grade-params.test.ts",
  "scripts/stroke-assembly.test.ts",
  "scripts/echo-surfaces.test.ts",
  "scripts/lines.test.ts",
  "scripts/railway.test.ts",
  "scripts/phonetic-family.test.ts",
  "scripts/shape-gate.test.ts",
  "scripts/reading-audio.test.ts",
  "scripts/framework-f1f4.test.ts",
  "scripts/surface-batch1.test.ts",
  "scripts/audio-batch2.test.ts",
  "scripts/meaning-batch3.test.ts",
  "scripts/shape-batch4.test.ts",
  "scripts/encounter-batch5.test.ts",
  "scripts/scale-g2.test.ts",
  "scripts/scale-g3.test.ts",
  "scripts/scale-g4.test.ts",
  "scripts/scale-g5.test.ts",
  "scripts/scale-g6.test.ts",
  "scripts/scale-w61.test.ts",
  "scripts/scale-w62.test.ts",
  "scripts/scale-w63.test.ts",
  "scripts/scale-w64.test.ts",
  "scripts/final-polish.test.ts",
  "scripts/qa-kd.test.ts",
  "scripts/grade-nav.test.ts",
  "scripts/echo-arrival.test.ts",
  "scripts/shape-copy.test.ts",
  "scripts/week-taught.test.ts",
  "scripts/grade-route.test.ts",
  "scripts/grade-p2.test.ts",
  "scripts/ux-ia.test.ts",
  "scripts/train-overview.test.ts",
  "scripts/check-surface-target-char.test.ts",
  "scripts/audit-g1-surfaces.test.ts",
  // Previously wired into no npm script at all.
  "scripts/s1-s2-arrival.test.ts",
  "scripts/u1-u2-ticket.test.ts",
  "scripts/b1-surface-seen.test.ts",
  "scripts/b3-child-save.test.ts",
  "scripts/guest-import.test.ts",
  "scripts/next-arrival.test.ts",
  "scripts/ticket-path-guard.test.ts",
  "scripts/i18n-locale-parity.test.ts",
  "scripts/door-scene.test.ts",
  "scripts/trial-clock.test.ts",
  "scripts/entitlement.test.ts",
  "scripts/subscription-derive.test.ts",
  "scripts/webhooks.test.ts",
  "scripts/trial-spent.test.ts",
];

const stages = [
  { name: "ticket path guard", cmd: process.execPath, args: ["scripts/check-ticket-path-guard.mjs"] },
  { name: "echo eligibility single source", cmd: process.execPath, args: ["scripts/check-echo-eligibility-single-source.mjs"] },
  { name: "single entitlement", cmd: process.execPath, args: ["scripts/check-single-entitlement.mjs"] },
  { name: "derived subscription", cmd: process.execPath, args: ["scripts/check-derived-subscription.mjs"] },
  { name: "webhook-only entitlement", cmd: process.execPath, args: ["scripts/check-webhook-only-entitlement.mjs"] },
  { name: "*.test.mjs (node:test)", cmd: process.execPath, args: ["--test", "scripts/**/*.test.mjs"] },
  { name: "*.test.ts (node:test)", cmd: process.execPath, args: ["--experimental-strip-types", "--test", ...TS_TESTS] },
];

const results = [];
for (const stage of stages) {
  console.log(`\n=== ${stage.name} ===`);
  const out = spawnSync(stage.cmd, stage.args, { stdio: "inherit", shell: process.platform === "win32" });
  const ok = out.status === 0 && !out.error;
  results.push({ name: stage.name, ok, status: out.status, error: out.error });
}

console.log("\n=== test summary ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  (exit ${r.status ?? "?"}${r.error ? `, ${r.error.message}` : ""})`}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} stage(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} stages passed.`);
