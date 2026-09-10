import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSubscribeAction, parsePlanParam } from "../src/lib/subscribe-resolve.ts";

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
