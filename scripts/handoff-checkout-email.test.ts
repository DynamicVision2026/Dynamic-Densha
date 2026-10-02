import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Work order §6: the checkout[email] prefill and the on-screen notice.
 * Source-scan over src/lib/server/handoff.ts and src/routes/handoff.tsx --
 * the server function needs a real DB/session to exercise end to end (see
 * scripts/handoff-error-surface.test.ts for the same reasoning on this
 * file's error-surface wiring).
 */

test("handoff.ts fetches the account email and threads it into buildCheckoutUrl", async () => {
  const code = await readFile("src/lib/server/handoff.ts", "utf8");
  assert.match(code, /select email from "user" where id = \$\{context\.userId\}/);
  assert.match(code, /buildCheckoutUrl\(decision\.plan, token, accountEmail\)/);
});

test("the checkout result carries accountEmail back to the client", async () => {
  const code = await readFile("src/lib/server/handoff.ts", "utf8");
  assert.match(code, /kind:\s*"checkout".*accountEmail/s);
});

test("handoff.tsx renders the email notice above the checkout button, only when an account email exists", async () => {
  const code = await readFile("src/routes/handoff.tsx", "utf8");
  const noticeIndex = code.indexOf("handoffEmailNotice");
  const buttonIndex = code.indexOf("data-checkout-cta");
  assert.ok(noticeIndex > -1, "handoffEmailNotice must be rendered somewhere");
  assert.ok(buttonIndex > -1 && noticeIndex < buttonIndex, "the notice must appear before the checkout button in source order");
  assert.match(code, /checkout\?\.accountEmail\s*\?/, "must be conditioned on accountEmail being present");
});
