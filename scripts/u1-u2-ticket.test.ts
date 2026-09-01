import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { earliestArrival, type SessionAlmostRow } from "../src/lib/session-almost.ts";

test("DepartureTicket is a button with accessible name", () => {
  const src = readFileSync("src/components/departure-ticket.tsx", "utf8");
  assert.match(src, /<button/);
  assert.match(src, /type="button"/);
  assert.match(src, /aria-label=\{ariaName\}/);
  assert.match(src, /きょうの きっぷ、のる/);
});

test("empty ticket has data-ticket-empty and a click handler", () => {
  const src = readFileSync("src/components/departure-ticket.tsx", "utf8");
  assert.match(src, /data-ticket-empty/);
  assert.match(src, /onClick=\{onRide\}/);
  assert.match(src, /emptyLead/);
  assert.equal(/[^a-z-]disabled=\{/.test(src), false);
});

test("glyphs come from board cards, not a hardcoded list", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  const ticket = readFileSync("src/components/departure-ticket.tsx", "utf8");
  assert.match(home, /boardStageCards/);
  assert.match(home, /glyphs=\{glyphs\}/);
  assert.equal(/\["一"/.test(ticket), false);
});

test("no date math in ticket components", () => {
  for (const f of [
    "src/components/departure-ticket.tsx",
    "src/components/session-stub.tsx",
    "src/components/child-home.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.equal(/Date\.parse/.test(src), false, f);
    assert.equal(/echo_delay|echoFirstDelay/.test(src), false, f);
    assert.equal(/\* 3600/.test(src), false, f);
  }
});

test("perfect input still labels だいたい", () => {
  const src = readFileSync("src/components/session-stub.tsx", "utf8");
  assert.match(src, /だいたい/);
  assert.equal(/かんぺき/.test(src), false);
  assert.match(src, /status === "fix"/);
});

test("one stub for a 3-char session; earliest nextArrival.label wins", () => {
  const rows: SessionAlmostRow[] = [
    { kanji: "右", label: "あさって", dueIso: "2026-09-04T00:00:00.000Z", dueLocalDate: "2026-09-04" },
    { kanji: "雨", label: "あした", dueIso: "2026-09-03T00:00:00.000Z", dueLocalDate: "2026-09-03" },
    { kanji: "円", label: "きょう", dueIso: "2026-09-02T12:00:00.000Z", dueLocalDate: "2026-09-02" },
  ];
  const early = earliestArrival(rows);
  assert.equal(early?.label, "きょう");
  assert.equal(rows.map((r) => r.kanji).join(""), "右雨円");
});

test("stub has no dashed border class", () => {
  const src = readFileSync("src/components/session-stub.tsx", "utf8");
  assert.equal(/dashed/.test(src), false);
});

test("no hrefHome demo wrap around ticket components; no ほぞんする", () => {
  const ticket = readFileSync("src/components/departure-ticket.tsx", "utf8");
  const stub = readFileSync("src/components/session-stub.tsx", "utf8");
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.equal(/hrefHome === "\/demo"/.test(ticket), false);
  assert.equal(/hrefBase === "\/demo"/.test(ticket), false);
  assert.equal(/hrefHome === "\/demo"/.test(stub), false);
  assert.equal(/hrefBase === "\/demo"/.test(stub), false);
  assert.equal(/ほぞんする/.test(ticket + stub + session), false);
  assert.match(session, /stubClaim/);
  assert.match(session, /stubLater/);
  assert.match(session, /toBoard/);
  assert.match(session, /seeTrain/);
});
