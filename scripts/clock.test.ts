import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createTestClock, systemClock } from "../src/lib/server/clock.ts";

/**
 * clock.ts's own guarantees, independent of anything it's wired into:
 *   - systemClock really tracks the system clock.
 *   - createTestClock can be set and advanced.
 *   - createTestClock is refused outright when NODE_ENV=production -- the
 *     environment gate from the engineering ticket's §A.3(b), a second,
 *     independent layer behind "no request path reaches clock selection"
 *     (§A.3(a), pinned by the source-scan test below).
 */

test("systemClock tracks real time", () => {
  const before = Date.now();
  const now = systemClock.now().getTime();
  const after = Date.now();
  assert.ok(now >= before && now <= after);
});

test("createTestClock starts at the given instant and only moves when told to", () => {
  const clock = createTestClock("2026-01-01T00:00:00.000Z");
  assert.equal(clock.now().toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(clock.now().toISOString(), "2026-01-01T00:00:00.000Z");
});

test("advanceHours moves the clock by exactly that many hours", () => {
  const clock = createTestClock("2026-01-01T00:00:00.000Z");
  clock.advanceHours(20);
  assert.equal(clock.now().toISOString(), "2026-01-01T20:00:00.000Z");
  clock.advanceHours(148); // 20 + 148 = 168
  assert.equal(clock.now().toISOString(), "2026-01-08T00:00:00.000Z");
});

test("set jumps to an absolute instant regardless of what came before", () => {
  const clock = createTestClock("2026-01-01T00:00:00.000Z");
  clock.advanceHours(500);
  clock.set("2030-06-15T12:00:00.000Z");
  assert.equal(clock.now().toISOString(), "2030-06-15T12:00:00.000Z");
});

test("createTestClock throws when NODE_ENV=production, and only then", () => {
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => createTestClock("2026-01-01T00:00:00.000Z"), /production/);
  } finally {
    process.env.NODE_ENV = prev;
  }
  // Restored: the same call that just threw now succeeds again.
  assert.doesNotThrow(() => createTestClock("2026-01-01T00:00:00.000Z"));
});

test("no request path reaches clock selection: TestClock is referenced only from clock.ts and tests", () => {
  const clockSrc = readFileSync("src/lib/server/clock.ts", "utf8");
  assert.match(clockSrc, /export function createTestClock/);

  // Nothing under src/routes (the only request-facing layer) or the
  // production write path may import a test clock, a request field named
  // like one, or take a clock from anywhere but its own default parameter.
  const routeFiles = [
    "src/routes/app/child.$childId.kanji.$char.tsx",
  ];
  for (const f of routeFiles) {
    const src = readFileSync(f, "utf8");
    assert.equal(/createTestClock|TestClock/.test(src), false, `${f} must never reference a test clock`);
  }
  const writeSrc = readFileSync("src/lib/server/progress-write.ts", "utf8");
  assert.equal(/createTestClock|TestClock/.test(writeSrc), false);
  // The only clock parameter the write path exposes defaults to systemClock,
  // and nothing in that file reads it off `data` (the validated, client-
  // controlled input) or off any request/context object.
  assert.match(writeSrc, /clock: Clock = systemClock/);
  assert.equal(/data\.clock|data\.nowIso|context\.clock|context\.nowIso/.test(writeSrc), false);
});
