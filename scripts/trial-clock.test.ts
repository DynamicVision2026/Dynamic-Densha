import assert from "node:assert/strict";
import { test } from "node:test";
import { trialEndsAtFrom } from "../src/lib/trial-clock.ts";
import { ymdInZone } from "../src/lib/echo-arrival.ts";

test("trial ends at 23:59:59 JST, ten full calendar days later", () => {
  const start = "2026-09-01T03:00:00.000Z"; // 12:00 JST, 2026-09-01
  const end = trialEndsAtFrom(start, 10);
  // 23:59:59.999 JST on 2026-09-11 == 14:59:59.999 UTC on 2026-09-11.
  assert.equal(end, "2026-09-11T14:59:59.999Z");
  assert.equal(ymdInZone(end), "2026-09-11");
});

test("a trial started 1 minute before JST midnight still gets the full ten days", () => {
  const start = "2026-09-01T14:59:00.000Z"; // 23:59 JST, 2026-09-01
  const end = trialEndsAtFrom(start, 10);
  // Naive now+10*24h would land at 2026-09-11T14:59:00Z, well short of
  // 23:59 JST on day 10 -- almost 9 hours of the tenth day would be lost.
  assert.equal(ymdInZone(start), "2026-09-01");
  assert.equal(ymdInZone(end), "2026-09-11");
  assert.equal(end, "2026-09-11T14:59:59.999Z");
});

test("day count is exactly N calendar days apart in JST, regardless of time of day", () => {
  for (const start of [
    "2026-01-01T00:00:00.000Z",
    "2026-06-15T23:59:59.000Z",
    "2026-12-31T14:59:59.999Z", // right at the JST day boundary
  ]) {
    const end = trialEndsAtFrom(start, 10);
    const startDay = Date.parse(`${ymdInZone(start)}T00:00:00.000Z`) / 86_400_000;
    const endDay = Date.parse(`${ymdInZone(end)}T00:00:00.000Z`) / 86_400_000;
    assert.equal(endDay - startDay, 10, `start=${start} end=${end}`);
  }
});

test("day-7 grace check reads naturally off the same function", () => {
  const start = "2026-09-01T00:00:00.000Z";
  const day7 = trialEndsAtFrom(start, 7);
  const day10 = trialEndsAtFrom(start, 10);
  assert.ok(Date.parse(day7) < Date.parse(day10));
});
