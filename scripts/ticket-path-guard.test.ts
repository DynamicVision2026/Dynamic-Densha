import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("T3: path guards must not wrap ticket chrome; check script exits 0", () => {
  const out = execFileSync("node", ["scripts/check-ticket-path-guard.mjs"], {
    encoding: "utf8",
  });
  assert.match(out, /ticket-path-guard ok/);
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.match(home, /<DepartureTicket/);
  assert.match(session, /<SessionStub/);
  assert.equal(/hrefHome === ["']\/demo["'][\s\S]{0,80}<SessionStub/.test(session), false);
  assert.equal(/hrefBase === ["']\/demo["'][\s\S]{0,80}<DepartureTicket/.test(home), false);
});
