import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isAllowedNext, resolvePostAuthNext } from "../src/lib/post-auth-redirect.ts";

/**
 * The admin surface must not be caught by the consumer onboarding gate.
 *
 * Every post-login destination hops through /onboard (src/routes/login.tsx),
 * and /onboard shows the register-a-child form to any account with zero
 * children -- which is every admin account, forever. These lock down the
 * four links in that chain.
 */

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("/app/admin survives the post-auth allow-list instead of falling back to /app", () => {
  assert.equal(isAllowedNext("/app/admin"), true);
  assert.equal(resolvePostAuthNext("/app/admin"), "/app/admin");
  // Falling back to /app is what sent an admin into onboarding.
  assert.notEqual(resolvePostAuthNext("/app/admin"), "/app");
});

test("widening the allow-list did not weaken it", () => {
  assert.equal(isAllowedNext("https://evil.example/app/admin"), false);
  assert.equal(isAllowedNext("//evil.example/app/admin"), false);
  assert.equal(isAllowedNext("/app/admin/../../evil"), false);
  assert.equal(isAllowedNext("/admin"), false);
  assert.equal(resolvePostAuthNext("/app/adminx"), "/app");
  assert.equal(resolvePostAuthNext(null), "/app");
});

test("a signed-out visitor to /app/* is returned to where they were going", () => {
  const src = codeOf("src/routes/app/route.tsx");
  assert.match(src, /isAllowedNext\(path\)/);
  assert.match(src, /<RedirectToSignIn next=/);
});

test("the sign-in redirect passes `next` as search, and freezes it", () => {
  const src = codeOf("src/lib/auth/gates.tsx");
  // A query string baked into `to` is dropped: <Navigate> treats `to` as a
  // route path. It has to go through `search`.
  assert.match(src, /search=\{frozen\.next \? \{ next: frozen\.next \} : undefined\}/);
  assert.equal(/to=\{`\$\{[^`]*\}\?next=/.test(src), false);
  // Frozen, because <Navigate> re-fires on every props change while the
  // caller is still mounted -- the second fire recomputed `next` against the
  // location it had just navigated to and wiped the search params.
  assert.match(src, /useState\(\{ to, next \}\)/);
});

test("/onboard sends an admin to the dashboard instead of the child form", () => {
  const src = codeOf("src/routes/onboard.tsx");
  assert.match(src, /getAdminStatus/);
  assert.match(src, /navigate\(\{ to: "\/app\/admin" \}\)/);
  // The form must not render while the admin question is still open, or an
  // admin sees "register a child" flash before being moved on.
  assert.match(src, /adminUndecided \|\| isAdmin/);
});

test("/app routes a childless admin to the dashboard, never to onboarding", () => {
  const src = codeOf("src/routes/app/index.tsx");
  assert.match(src, /getAdminStatus/);
  assert.match(src, /adminQ\.data\?\.isAdmin \? "\/app\/admin" : "\/onboard"/);
  // Decide once: bouncing to /onboard first and correcting afterwards is the
  // bug, not a cosmetic issue.
  assert.match(src, /if \(adminQ\.isLoading\) return;/);
});

test("the admin check is only paid for by an account that would hit onboarding", () => {
  for (const path of ["src/routes/app/index.tsx", "src/routes/onboard.tsx"]) {
    assert.match(codeOf(path), /enabled: (Boolean\(user\) && )?childless/);
  }
});

test("a non-admin gets 403, not a redirect into the consumer flow", () => {
  const src = codeOf("src/routes/app/admin.tsx");
  assert.match(src, /function Forbidden\(\)/);
  assert.match(src, /data-admin-forbidden/);
  assert.match(src, /adminForbiddenTitle/);
  assert.match(src, /backToApp/);
  // The old behaviour: any failure bounced to /app, which for a childless
  // account is the register-a-child form.
  assert.equal(/window\.location\.href = "\/app"/.test(src), false);
});

test("authorization is still decided on the server, twice", () => {
  const server = codeOf("src/lib/server/admin.ts");
  assert.match(server, /isCallerAdmin/);
  // The data query refuses a non-admin regardless of what the client asked.
  assert.match(server, /if \(!\(await isCallerAdmin\(sql, context\.userId\)\)\) throw new Error/);
  const route = codeOf("src/routes/app/admin.tsx");
  assert.match(route, /enabled: isAdmin/);
});

test("the status probe answers a boolean and leaks nothing else", () => {
  const src = readFileSync("src/lib/server/admin.ts", "utf8");
  const start = src.indexOf("export const getAdminStatus");
  assert.ok(start > -1, "getAdminStatus should exist");
  const rest = src.slice(start);
  const probe = rest.slice(0, rest.indexOf("});") + 3); // the handler itself, not the next declaration's docstring
  assert.match(probe, /Promise<\{ isAdmin: boolean \}>/);
  assert.equal(/email:|ownerEmail|household/.test(probe), false);
});

test("the overview carries the webhook log the admin surface promises", () => {
  const server = codeOf("src/lib/server/admin.ts");
  assert.match(server, /webhookEvents/);
  assert.match(server, /from billing_event/);
  assert.match(server, /order_name/);
  const route = codeOf("src/routes/app/admin.tsx");
  assert.match(route, /data-admin-webhooks/);
  assert.match(route, /adminWebhookLog/);
});
