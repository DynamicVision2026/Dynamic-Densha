import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSubscribeAction, parsePlanParam } from "../src/lib/subscribe-resolve.ts";

test("parsePlanParam maps the landing page's spelling to this app's Plan type", () => {
  assert.equal(parsePlanParam("monthly"), "monthly");
  assert.equal(parsePlanParam("annual"), "yearly");
});

test("parsePlanParam rejects anything else, including null, empty, and near-misses", () => {
  assert.equal(parsePlanParam(null), undefined);
  assert.equal(parsePlanParam(""), undefined);
  assert.equal(parsePlanParam("yearly"), undefined); // internal spelling, not the landing page's
  assert.equal(parsePlanParam("Monthly"), undefined); // case-sensitive on purpose
  assert.equal(parsePlanParam("monthly "), undefined);
});

test("branch 1: missing or invalid plan -> invalid-plan, regardless of session/active state", () => {
  for (const planParam of [null, "", "garbage", "yearly"]) {
    for (const hasSession of [false, true]) {
      for (const isActive of [false, true]) {
        assert.deepEqual(decideSubscribeAction({ planParam, hasSession, isActive }), { kind: "invalid-plan" });
      }
    }
  }
});

test("branch 2: valid plan, no session -> no-session, carrying the original planParam for the self-link", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "monthly", hasSession: false, isActive: false }),
    { kind: "no-session", planParam: "monthly" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: false, isActive: true }),
    { kind: "no-session", planParam: "annual" },
  );
});

test("branch 4: valid plan, session, already active -> already-active (never double-charge)", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "monthly", hasSession: true, isActive: true }),
    { kind: "already-active" },
  );
});

test("branch 5: valid plan, session, not active -> checkout with the resolved Plan", () => {
  assert.deepEqual(
    decideSubscribeAction({ planParam: "monthly", hasSession: true, isActive: false }),
    { kind: "checkout", plan: "monthly" },
  );
  assert.deepEqual(
    decideSubscribeAction({ planParam: "annual", hasSession: true, isActive: false }),
    { kind: "checkout", plan: "yearly" },
  );
});

test("session presence is checked before active state -- a signed-out visitor never reaches already-active or checkout", () => {
  const decision = decideSubscribeAction({ planParam: "monthly", hasSession: false, isActive: true });
  assert.equal(decision.kind, "no-session");
});
