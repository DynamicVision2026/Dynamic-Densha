import assert from "node:assert/strict";
import { test } from "node:test";
import { echoArrival, echoArrivalWhen, ymdInZone } from "../src/lib/echo-arrival.ts";
import type { MessageKey } from "../src/lib/i18n/messages.ts";

const NOW = "2026-08-24T01:26:00.000Z"; // 10:26 JST Monday

const LABELS: Record<string, string> = {
  echoArrivalToday: "きょう",
  echoArrivalTomorrow: "あした",
  echoArrivalDayAfter: "あさって",
  echoArrivalInDays: "{n}日後",
};

function t(key: MessageKey, vars?: Record<string, string | number>) {
  const raw = LABELS[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

test("JA calendar: same Tokyo day is きょう, including overdue", () => {
  assert.equal(echoArrival("2026-08-24T06:00:00.000Z", NOW).kind, "today");
  assert.equal(echoArrival("2026-08-23T15:00:00.000Z", NOW).kind, "today");
  assert.equal(echoArrivalWhen("2026-08-23T15:00:00.000Z", NOW, t), "きょう");
});

test("JA calendar: next Tokyo day is あした", () => {
  assert.equal(echoArrival("2026-08-25T01:00:00.000Z", NOW).kind, "tomorrow");
  assert.equal(echoArrivalWhen("2026-08-25T01:00:00.000Z", NOW, t), "あした");
});

test("JA calendar: +2 Tokyo days is あさって; later is N日後", () => {
  assert.equal(echoArrival("2026-08-26T01:00:00.000Z", NOW).kind, "dayAfter");
  assert.equal(echoArrivalWhen("2026-08-26T01:00:00.000Z", NOW, t), "あさって");
  const later = echoArrival("2026-08-31T01:00:00.000Z", NOW);
  assert.equal(later.kind, "inDays");
  assert.equal(later.n, 7);
  assert.equal(echoArrivalWhen("2026-08-31T01:00:00.000Z", NOW, t), "7日後");
});

test("never uses 遅れ / overdue wording", () => {
  const overdue = echoArrivalWhen("2026-08-10T00:00:00.000Z", NOW, t);
  assert.equal(overdue, "きょう");
  assert.doesNotMatch(overdue, /遅れ|overdue|late/i);
});

test("20h delay from 10:26 JST lands on あした", () => {
  const due = new Date(Date.parse(NOW) + 20 * 3600 * 1000).toISOString();
  assert.equal(ymdInZone(due), "2026-08-25");
  assert.equal(echoArrival(due, NOW).kind, "tomorrow");
});
