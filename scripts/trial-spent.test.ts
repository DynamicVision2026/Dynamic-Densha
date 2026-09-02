import assert from "node:assert/strict";
import { test } from "node:test";
import { hashEmail } from "../src/lib/trial-spent.ts";

test("same email normalizes to the same hash regardless of case/whitespace", () => {
  assert.equal(hashEmail("Parent@Example.com"), hashEmail(" parent@example.com "));
});

test("different emails hash differently", () => {
  assert.notEqual(hashEmail("a@example.com"), hashEmail("b@example.com"));
});

test("the hash never contains the plaintext email and looks like sha256 hex", () => {
  const h = hashEmail("secret-parent@example.com");
  assert.equal(h.includes("secret-parent"), false);
  assert.match(h, /^[0-9a-f]{64}$/);
});
