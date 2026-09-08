import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedNext, resolvePostAuthNext } from "../src/lib/post-auth-redirect.ts";

test("the three allow-listed paths pass, with or without a query string", () => {
  for (const path of ["/subscribe", "/app/parent", "/app"]) {
    assert.equal(isAllowedNext(path), true, path);
    assert.equal(isAllowedNext(`${path}?plan=monthly&x=1`), true, `${path}?plan=monthly&x=1`);
  }
});

test("absent/empty next is rejected", () => {
  assert.equal(isAllowedNext(undefined), false);
  assert.equal(isAllowedNext(null), false);
  assert.equal(isAllowedNext(""), false);
});

test("a same-origin path that isn't one of the three exact allow-listed ones is rejected", () => {
  assert.equal(isAllowedNext("/app/mistakes"), false);
  assert.equal(isAllowedNext("/subscribe/extra"), false);
  assert.equal(isAllowedNext("/settings"), false);
  assert.equal(isAllowedNext("/"), false);
});

test("an absolute or protocol-relative URL is rejected -- the open-redirect case this exists to close", () => {
  assert.equal(isAllowedNext("https://evil.example/"), false);
  assert.equal(isAllowedNext("http://evil.example/app"), false);
  assert.equal(isAllowedNext("//evil.example/app"), false);
  // The "://" check is deliberately blanket, not path-only: an otherwise
  // allow-listed path carrying a scheme anywhere (even inside its own query
  // string) is rejected rather than reasoned about case by case.
  assert.equal(isAllowedNext("/app/parent?redirect=https://evil.example"), false);
  assert.equal(isAllowedNext("javascript://evil.example/../../app"), false);
});

test("resolvePostAuthNext returns the allow-listed value unchanged", () => {
  assert.equal(resolvePostAuthNext("/subscribe?plan=annual"), "/subscribe?plan=annual");
  assert.equal(resolvePostAuthNext("/app/parent"), "/app/parent");
});

test("resolvePostAuthNext falls back to /app for anything not allow-listed, never throws, never passes the bad value through", () => {
  assert.equal(resolvePostAuthNext(undefined), "/app");
  assert.equal(resolvePostAuthNext("https://evil.example"), "/app");
  assert.equal(resolvePostAuthNext("/settings"), "/app");
});
