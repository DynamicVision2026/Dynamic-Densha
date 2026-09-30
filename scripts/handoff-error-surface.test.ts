import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * The concrete, evidenced candidate for the P0 "signup never reaches
 * checkout" report: buildCheckoutUrl (src/lib/shopify-checkout.ts) throws
 * when SHOPIFY_STORE_DOMAIN or a SHOPIFY_VARIANT_* env var is missing on the
 * deployed revision -- its own comment says the caller must "decide how to
 * surface that instead of silently sending a family to a 404". Before this
 * change, the caller (handoff.tsx) did not: any thrown error became
 * `handoffQ.isError`, and the effect fired `window.location.href =
 * "/app/parent"` with zero trace -- a parent who signs up during exactly
 * this kind of config gap lands back in the app with nothing telling them,
 * or anyone reading logs, why. Unlike the P0 diagnosis this closes (three
 * points that didn't reproduce against source), this one does: the throw
 * path and the silent-redirect path are both real code, not a guess.
 *
 * These are source-scan assertions, matching this repo's established style
 * for server-function/route wiring that a PGlite-free unit test can't reach
 * (see scripts/signup-resume.test.ts) -- the point is locking in that this
 * failure mode can never again be silent, not exercising the DB.
 */

test("resolveHandoff never lets buildCheckoutUrl's throw escape uncaught", async () => {
  const code = await readFile("src/lib/server/handoff.ts", "utf8");
  assert.match(code, /try\s*\{[\s\S]*buildCheckoutUrl\(/, "buildCheckoutUrl must be called inside a try block");
  assert.match(code, /catch\s*\(err\)[\s\S]*kind:\s*"error"/, "the catch branch must resolve to an explicit error result, not rethrow");
});

test("resolveHandoff logs a reason code for every branch, never customer data", async () => {
  const code = await readFile("src/lib/server/handoff.ts", "utf8");
  assert.match(code, /logHandoffOutcome/, "every exit path should log a structured reason code");
  assert.doesNotMatch(code, /console\.(log|error)\(`\[handoff\][^`]*\$\{.*email/i, "handoff logging must never include an email address");
});

test("handoff.tsx renders a visible failure state instead of silently redirecting on error", async () => {
  const code = await readFile("src/routes/handoff.tsx", "utf8");

  // The old bug: `if (handoffQ.isError) window.location.href = "/app/parent"`
  // inside the effect, with no visible state rendered first. Assert that
  // exact silent-bounce pattern is gone from the effect.
  assert.doesNotMatch(
    code,
    /if\s*\(handoffQ\.isError\)\s*window\.location\.href\s*=\s*"\/app\/parent";/,
    "handoffQ.isError must no longer trigger a silent redirect with no visible state",
  );

  // The server-reported config-error kind must render visible copy, not
  // join the other non-checkout kinds in the auto-redirect effect.
  assert.match(code, /kind\s*===\s*"error"/, "handoff.tsx must recognize the server's explicit error result kind");
  assert.match(code, /handoffErrorTitle/, "a visible error title must be rendered for the failure state");
  assert.match(code, /handoffErrorBody/, "a visible error body must be rendered for the failure state");
});

test("HandoffResult's error kind carries no message text to the client", async () => {
  const code = await readFile("src/lib/server/handoff.ts", "utf8");
  assert.match(code, /\{ kind: "error" \}/, "the client-facing error result must stay a bare kind tag, not a passthrough of err.message");
});
