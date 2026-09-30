import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { decideSubscribeAction, parsePlanParam } from "../src/lib/subscribe-resolve.ts";
import { isAllowedNext, resolvePostAuthNext } from "../src/lib/post-auth-redirect.ts";
import { buildCheckoutUrl } from "../src/lib/shopify-checkout.ts";

/**
 * The exact hop sequence a brand-new account takes from a landing-page plan
 * link to Shopify checkout (see the P0 ticket this closes):
 *
 *   /subscribe?plan=X (no session)
 *     -> /login?next=/subscribe?plan=X
 *     -> SIGN UP -> /onboard?next=/subscribe?plan=X
 *     -> create one child -> back to /subscribe?plan=X (now with a session)
 *     -> /handoff?plan=X -> real Shopify cart URL
 *
 * Each individual hop already has its own unit test (subscribe-resolve.test.ts,
 * post-auth-redirect.test.ts) -- what was missing, and what let a real signup
 * fail while every existing test stayed green, is a test that chains them:
 * nothing previously fed one hop's output into the next hop's input the way
 * the real routes do.
 */
function simulateSignupResumeToCheckout(planParam: string) {
  // 1. /subscribe?plan=X, no session.
  const plan = parsePlanParam(planParam);
  assert.ok(plan, `${planParam} must be a valid plan for this simulation`);
  const firstDecision = decideSubscribeAction({ planParam, hasSession: false, isActive: false });
  assert.equal(firstDecision.kind, "no-session");
  const selfLink = `/subscribe?plan=${(firstDecision as { kind: "no-session"; planParam: string }).planParam}`;

  // 2. /login?next=<selfLink> -- login.tsx builds onboardNext from this,
  // identically for signUp.email and signIn.email (asserted separately,
  // below, by reading login.tsx itself).
  const onboardNext = `/onboard?next=${encodeURIComponent(resolvePostAuthNext(selfLink))}`;

  // 3. /onboard?next=<...> after account creation -- a brand-new account has
  // zero children, so onboard.tsx shows its form rather than skipping past
  // it; `dest` is what it navigates to once the child is created.
  const onboardSearch = new URL(`https://app.kanji-ai.jp${onboardNext}`).searchParams;
  const dest = resolvePostAuthNext(onboardSearch.get("next"));
  assert.equal(dest, selfLink, "the plan must survive the full login->onboard round trip unchanged");

  // 4. Back at /subscribe?plan=X, now with a session, fresh signup so never
  // active yet.
  const secondDecision = decideSubscribeAction({ planParam, hasSession: true, isActive: false });
  assert.deepEqual(secondDecision, { kind: "checkout", plan });

  // 5. /handoff?plan=X builds the real Shopify cart URL.
  const checkoutToken = "11111111-1111-4111-8111-111111111111";
  const checkoutUrl = buildCheckoutUrl(plan, checkoutToken);
  return { checkoutUrl, plan, checkoutToken };
}

function withShopifyEnv<T>(fn: () => T): T {
  const prior = {
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    buyout: process.env.SHOPIFY_VARIANT_BUYOUT,
    annual: process.env.SHOPIFY_VARIANT_ANNUAL,
  };
  process.env.SHOPIFY_STORE_DOMAIN = "kanji-densha.myshopify.com";
  process.env.SHOPIFY_VARIANT_BUYOUT = "9001";
  process.env.SHOPIFY_VARIANT_ANNUAL = "9002";
  try {
    return fn();
  } finally {
    process.env.SHOPIFY_STORE_DOMAIN = prior.domain;
    process.env.SHOPIFY_VARIANT_BUYOUT = prior.buyout;
    process.env.SHOPIFY_VARIANT_ANNUAL = prior.annual;
  }
}

test("signed-out signup -> one child -> annual lands on Shopify checkout with the plan and token intact", () => {
  withShopifyEnv(() => {
    const { checkoutUrl, checkoutToken } = simulateSignupResumeToCheckout("annual");
    const url = new URL(checkoutUrl);
    assert.equal(url.hostname, "kanji-densha.myshopify.com");
    assert.equal(url.pathname, "/cart/9002:1");
    assert.equal(url.searchParams.get("attributes[kd_plan]"), "annual");
    assert.equal(url.searchParams.get("attributes[kd_token]"), checkoutToken);
    assert.ok(url.searchParams.get("attributes[kd_token]"), "kd_token must be present and non-empty");
  });
});

test("signed-out signup -> one child -> buyout lands on Shopify checkout with the plan and token intact", () => {
  withShopifyEnv(() => {
    const { checkoutUrl, checkoutToken } = simulateSignupResumeToCheckout("buyout");
    const url = new URL(checkoutUrl);
    assert.equal(url.pathname, "/cart/9001:1");
    assert.equal(url.searchParams.get("attributes[kd_plan]"), "buyout");
    assert.equal(url.searchParams.get("attributes[kd_token]"), checkoutToken);
  });
});

test("a malicious next is dropped silently -- signup still lands on /app, never off-origin", () => {
  const malicious = "https://example.com";
  assert.equal(isAllowedNext(malicious), false);
  const onboardNext = `/onboard?next=${encodeURIComponent(resolvePostAuthNext(malicious))}`;
  const onboardSearch = new URL(`https://app.kanji-ai.jp${onboardNext}`).searchParams;
  const dest = resolvePostAuthNext(onboardSearch.get("next"));
  assert.equal(dest, "/app");
});

// ── the wiring these pure-function chains assume actually exists ──────────

test("login.tsx sends signup through the identical callbackURL as login, not a separate/hardcoded one", async () => {
  const code = await readFile("src/routes/login.tsx", "utf8");
  // Both calls must reference the same onboardNext variable -- not a second,
  // independently-computed callbackURL for the signUp.email branch.
  const signUpBlock = code.slice(code.indexOf("mode === \"up\""), code.indexOf("authClient.signIn.email"));
  assert.match(signUpBlock, /callbackURL:\s*onboardNext/, "signUp.email must pass onboardNext, the same value signIn.email uses");
  assert.match(code, /signInWithGoogle\(\{\s*callbackURL:\s*onboardNext/, "Google sign-in must carry the same onboardNext too");
});

test("onboard.tsx's post-creation redirect uses the resolved dest, never a bare hardcoded /app", async () => {
  const code = await readFile("src/routes/onboard.tsx", "utf8");
  assert.match(code, /const dest = resolvePostAuthNext\(search\.next\)/);
  // The only literal "/app" allowed here is the one deliberate special case
  // (an in-app navigate rather than a full reload when dest IS "/app") --
  // the else branch must fall through to `dest`, not to a second, separate
  // hardcoded "/app".
  assert.match(code, /window\.location\.href = dest/, "the non-'/app' branch must navigate to the resolved dest");
});
