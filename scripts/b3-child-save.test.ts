import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("child ride components have no ほぞんする", () => {
  const dir = "src/components";
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    assert.equal(/ほぞんする/.test(src), false, f);
  }
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.match(session, /toBoard/);
  assert.match(session, /seeTrain/);
  assert.equal(/guestSave/.test(session), false);
  assert.equal(/savePrompt/.test(session), false);
  const shell = readFileSync("src/components/ride-shell.tsx", "utf8");
  assert.equal(/ほぞんする|guestSave|savePrompt/.test(shell), false);
});

test("PR #6 child ほぞんする must not return on this branch", () => {
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.equal(session.includes("ほぞんする"), false);
  assert.equal(/guestSave|savePrompt|markGuestSavePrompted/.test(session), false);
  let guestRide = "";
  try {
    guestRide = readFileSync("src/lib/guest-ride.ts", "utf8");
  } catch {
    guestRide = "";
  }
  if (guestRide) {
    assert.match(guestRide, /markGuestRidden/);
    assert.equal(/ほぞんする/.test(guestRide), false);
  }
});
