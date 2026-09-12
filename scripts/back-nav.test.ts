import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { backTargetFor } from "../src/lib/back-nav.ts";

/**
 * もどる is the only way out of a page that has no other exit, so where it
 * points is not cosmetic. It used to be derived from the path alone, with
 * /demo -- the marketing tour -- as the fallback for anything outside /app and
 * /demo. Exactly one route is outside both, /onboard, so a signed-in parent
 * who tapped 「＋ 追加」 and changed their mind was shown the door.
 */

test("a parent adding a sibling goes back to the hub they came from", () => {
  assert.equal(
    backTargetFor({ path: "/onboard", signedIn: true, addingChild: true }),
    "/app/parent/settings",
  );
});

test("a first run offers no もどる at all, rather than one that loops or leaves", () => {
  // /app redirects a childless household straight back to /onboard, so a link
  // there returns you to the page you are on; /demo leaves the app entirely.
  assert.equal(backTargetFor({ path: "/onboard", signedIn: true }), null);
});

test("a signed-out visitor on the form still belongs on the guest surface", () => {
  assert.equal(backTargetFor({ path: "/onboard", signedIn: false }), "/demo");
});

test("the two child surfaces are unchanged -- each is its own home", () => {
  assert.equal(backTargetFor({ path: "/app/parent/settings", signedIn: true }), "/app");
  assert.equal(backTargetFor({ path: "/app/child/abc/catalog", signedIn: true }), "/app");
  assert.equal(backTargetFor({ path: "/demo/catalog", signedIn: false }), "/demo");
  // A signed-in visitor browsing the demo still goes back into the demo: the
  // path they are on is the better evidence of where they were.
  assert.equal(backTargetFor({ path: "/demo/catalog", signedIn: true }), "/demo");
});

test("a future route outside both prefixes never sends a signed-in parent to marketing", () => {
  assert.equal(backTargetFor({ path: "/handoff", signedIn: true }), "/app");
  assert.equal(backTargetFor({ path: "/handoff", signedIn: false }), "/demo");
});

test("the shell asks the rule rather than re-deriving it from the path", () => {
  const src = readFileSync("src/components/app-shell.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /backTargetFor\(/);
  // The exact expression that caused the bug: a path-only ternary ending in a
  // bare "/demo" fallback.
  assert.equal(/path\.startsWith\("\/app"\)\s*\?\s*"\/app"\s*:\s*"\/demo"/.test(src), false);
  // And it must be able to render no back link, which is the first-run answer.
  assert.match(src, /back \?/);
});

test("the add-a-child flag is read the same way the route parses it", () => {
  // onboard.tsx accepts 1/true/"1"/"true"; the shell reads the raw search
  // string, so it has to accept the same spellings or もどる silently reverts
  // to the first-run answer for a parent who typed ?add=1 by hand.
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const pattern = shell.match(/add=\(([^)]*)\)/)?.[1] ?? "";
  for (const spelling of ["1", "true"]) {
    assert.ok(pattern.includes(spelling), `the shell must accept add=${spelling}`);
  }
});
