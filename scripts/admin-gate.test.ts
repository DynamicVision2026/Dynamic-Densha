import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdminEmail } from "../src/lib/admin-gate.ts";

test("the hardcoded admin email is always allowed, with no ADMIN_EMAILS configured", () => {
  assert.equal(isAdminEmail("brian2023.tokyo@gmail.com", undefined), true);
  assert.equal(isAdminEmail("brian2023.tokyo@gmail.com", null), true);
  assert.equal(isAdminEmail("brian2023.tokyo@gmail.com", ""), true);
});

test("the hardcoded admin email matches case-insensitively and ignores surrounding whitespace", () => {
  assert.equal(isAdminEmail("Brian2023.Tokyo@Gmail.com", undefined), true);
  assert.equal(isAdminEmail("  brian2023.tokyo@gmail.com  ", undefined), true);
});

test("an email on the ADMIN_EMAILS allow-list is authorized", () => {
  assert.equal(isAdminEmail("parent@example.com", "parent@example.com"), true);
  assert.equal(isAdminEmail("second@example.com", "first@example.com,second@example.com"), true);
});

test("ADMIN_EMAILS entries are matched case-insensitively and trimmed", () => {
  assert.equal(isAdminEmail("Second@Example.com", " first@example.com , SECOND@example.com "), true);
});

test("an ordinary parent is not authorized", () => {
  assert.equal(isAdminEmail("parent@example.com", undefined), false);
  assert.equal(isAdminEmail("parent@example.com", "someone-else@example.com"), false);
});

test("no email at all (unauthenticated) is never authorized, regardless of ADMIN_EMAILS", () => {
  assert.equal(isAdminEmail(null, "brian2023.tokyo@gmail.com"), false);
  assert.equal(isAdminEmail(undefined, "brian2023.tokyo@gmail.com"), false);
  assert.equal(isAdminEmail("", "brian2023.tokyo@gmail.com"), false);
});

test("a near-miss email (substring, different domain) is rejected", () => {
  assert.equal(isAdminEmail("brian2023.tokyo@gmail.com.evil.example", undefined), false);
  assert.equal(isAdminEmail("notbrian2023.tokyo@gmail.com", undefined), false);
});
