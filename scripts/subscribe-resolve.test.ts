import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { decideSubscribeAction, isUpgrade, parsePlanParam } from "../src/lib/subscribe-resolve.ts";

test("parsePlanParam accepts exactly buyout and annual", () => {
  assert.equal(parsePlanParam("buyout"), "buyout");
  assert.equal(parsePlanParam("annual"), "annual");
});

test("parsePlanParam rejects anything else, including null, empty, and near-misses", () => {
  assert.equal(parsePlanParam(null), undefined);
  assert.equal(parsePlanParam(""), undefined);
  assert.equal(parsePlanParam("monthly"), undefined); // the old, pre-migration spelling
  assert.equal(parsePlanParam("yearly"), undefined); // the old internal spelling
  assert.equal(parsePlanParam("Buyout"), undefined); // case-sensitive on purpose
  assert.equal(parsePlanParam("buyout "), undefined);
});

test("branch 1: missing or invalid plan -> invalid-plan, regardless of session/active state", () => {
  for (const planParam of [null, "", "garbage", "monthly"]) {
    for (const hasSession of [false, true]) {
      for (const isActive of [false, true]) {
        assert.deepEqual(decideSubscribeAction({ planParam, hasSession, isActive }), { kind: "invalid-plan" });
      }
    }
  }
});

test("branch 2: valid plan, no session -> no-session, carrying the original planParam for the self-link", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: false, isActive: false }),
    { kind: "no-session", planParam: "buyout" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: false, isActive: true }),
    { kind: "no-session", planParam: "annual" },
  );
});

test("branch 4: valid plan, session, already active -> already-active (never double-charge)", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: true }),
    { kind: "already-active" },
  );
});

test("branch 5: valid plan, session, not active -> checkout with the resolved Plan", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: false }),
    { kind: "checkout", plan: "buyout" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: true, isActive: false }),
    { kind: "checkout", plan: "annual" },
  );
});

test("session presence is checked before active state -- a signed-out visitor never reaches already-active or checkout", () => {
  const decision = decideSubscribeAction({ planParam: "buyout", hasSession: false, isActive: true });
  assert.equal(decision.kind, "no-session");
});

// ── annual -> buyout: the one purchase an active household may make ───────

test("an annual household may buy the family licence -- the upgrade the card advertises", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: true, currentPlan: "annual" }),
    { kind: "checkout", plan: "buyout" },
  );
});

test("a buyout household is refused: it already covers every child", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: true, currentPlan: "buyout" }),
    { kind: "already-active" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: true, isActive: true, currentPlan: "buyout" }),
    { kind: "already-active" },
  );
});

test("re-buying the plan you already hold is still refused", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: true, isActive: true, currentPlan: "annual" }),
    { kind: "already-active" },
  );
});

test("active with an unknown plan is refused rather than guessed at", () => {
  // The unmatched-variant edge case: we cannot say what this household paid
  // for, and a wrong guess charges a family twice. Absent and null alike.
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: true, currentPlan: null }),
    { kind: "already-active" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: true, isActive: true }),
    { kind: "already-active" },
  );
});

test("a trial household is unaffected -- never active, so any plan is a first purchase", () => {
  for (const plan of ["buyout", "annual"] as const) {
    assert.deepEqual(
      decideSubscribeAction({ planParam: plan, hasSession: true, isActive: false, currentPlan: null }),
      { kind: "checkout", plan },
    );
  }
});

test("a signed-out visitor is still sent to sign in, whatever they hold", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "buyout", hasSession: false, isActive: true, currentPlan: "annual" }),
    { kind: "no-session", planParam: "buyout" },
  );
});

test("isUpgrade names exactly one transition", () => {
  assert.equal(isUpgrade("annual", "buyout"), true);
  assert.equal(isUpgrade("buyout", "annual"), false);
  assert.equal(isUpgrade("annual", "annual"), false);
  assert.equal(isUpgrade("buyout", "buyout"), false);
  assert.equal(isUpgrade(null, "buyout"), false);
});

test("both entry points decide with the plan, not merely with 'active'", async () => {
  // /handoff is reachable directly, so it must reach the same verdict
  // /subscribe just forwarded it -- otherwise the upgrade 302s into a refusal.
  for (const path of ["src/routes/subscribe.ts", "src/lib/server/handoff.ts"]) {
    const code = await readFile(path, "utf8");
    assert.match(code, /currentPlan:/, `${path} must pass the current plan into the decision`);
    assert.equal(
      /isHouseholdActive\(/.test(code),
      false,
      `${path} must read plan and active together, from one recompute`,
    );
  }
});

// ── the funnel's entry points must be real browser navigations ─────────────

/**
 * /subscribe renders nothing -- it is a `server: { handlers }` route whose
 * whole job is resolve household -> 302. A TanStack <Link> to it performs a
 * CLIENT-side navigation, which has no component to mount: the parent stays
 * on the page they were on, with no error and no way forward but a manual
 * reload. That is exactly what happened to the ご家庭ライセンス CTA on the
 * pass assignment card, which shipped as a <Link> while the two plan cards
 * beside it were plain anchors.
 *
 * So this is a rule about every server-only route, derived rather than
 * hardcoded: the next such route added gets the same protection without
 * anyone remembering to extend a list.
 */
test("no component client-side-navigates to a route that renders nothing", async () => {
  const serverOnly: string[] = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        const src = await readFile(full, "utf8");
        if (/server:\s*\{/.test(src) && /handlers/.test(src)) {
          // src/routes/subscribe.ts -> /subscribe
          serverOnly.push("/" + full.replace(/^src\/routes\//, "").replace(/\.ts$/, "").replace(/\/index$/, ""));
        }
      }
    }
  };
  await walk("src/routes");
  assert.ok(serverOnly.includes("/subscribe"), "the resolver itself must be detected");

  const sources: { path: string; code: string }[] = [];
  const collect = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await collect(full);
      else if (/\.tsx?$/.test(entry.name)) sources.push({ path: full, code: await readFile(full, "utf8") });
    }
  };
  await collect("src");

  for (const route of serverOnly) {
    for (const { path, code } of sources) {
      const linked = new RegExp(`to=\\{?["']${route}["']`).test(code);
      assert.equal(linked, false, `${path} uses <Link to="${route}">; ${route} renders nothing, so it needs a plain <a href>`);
    }
  }
});

test("every buyout CTA is an anchor the browser follows itself", async () => {
  for (const path of ["src/components/pass-assignment-card.tsx", "src/components/plan-cards.tsx"]) {
    const code = await readFile(path, "utf8");
    assert.match(code, /href="\/subscribe\?plan=buyout"/, `${path} must link the funnel by href`);
  }
  // And the href carries the plan in the query string rather than relying on
  // a router `search` prop, which only exists on a client-side navigation.
  const card = await readFile("src/components/pass-assignment-card.tsx", "utf8");
  assert.equal(/search=\{\{\s*plan/.test(card), false);
});
