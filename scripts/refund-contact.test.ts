import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSupportMailto,
  APP_VERSION,
  SUPPORT_EMAIL,
  type SupportMailtoKind,
} from "../src/lib/refund-contact.ts";

const KINDS: SupportMailtoKind[] = ["support", "refund", "bug"];

// A representative context. If any of these strings leaked into a diagnostics
// block by accident, this is where it would show up.
const CONTEXT = { orderName: "#1234", email: "parent@example.com" };

// Strings that must never appear in a support mail -- anything that
// identifies a child, a household, or their learning record. Support looks
// a purchase up by order name and account email; it has no legitimate need
// for any of this, and the diagnostics block especially must stay limited
// to {app version, order name, timestamp}.
const FORBIDDEN_SNIPPETS = [
  "childId",
  "child_id",
  "householdId",
  "household_id",
  "childName",
  "child_name",
  "practiceCount",
  "masteryStatus",
  "echoDueAt",
  "progress",
];

test("buildSupportMailto never includes child/household/progress data, for any kind", () => {
  for (const kind of KINDS) {
    const href = buildSupportMailto({ kind, context: CONTEXT });
    const decoded = decodeURIComponent(href);
    for (const snippet of FORBIDDEN_SNIPPETS) {
      assert.equal(decoded.includes(snippet), false, `${kind} mail includes forbidden snippet "${snippet}"`);
    }
  }
});

test("buildSupportMailto's diagnostics block has the required shape and nothing else", () => {
  for (const kind of KINDS) {
    const decoded = decodeURIComponent(buildSupportMailto({ kind, context: CONTEXT }));
    assert.match(decoded, /---\nサポート情報（変更しないでください）\n/);
    assert.match(decoded, new RegExp(`アプリ: v${APP_VERSION.replace(/\./g, "\\.")}`));
    assert.match(decoded, /参照: #1234/);
    assert.match(decoded, /日時: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  }
});

test("buildSupportMailto falls back to em dash for the diagnostics reference when there is no order", () => {
  const decoded = decodeURIComponent(
    buildSupportMailto({ kind: "support", context: { orderName: null, email: null } }),
  );
  assert.match(decoded, /参照: —/);
});

test("each kind gets its own subject and goes to the same support address", () => {
  const subjects = new Set<string>();
  for (const kind of KINDS) {
    const href = buildSupportMailto({ kind, context: CONTEXT });
    assert.ok(href.startsWith(`mailto:${SUPPORT_EMAIL}?`));
    const subject = decodeURIComponent(new URLSearchParams(href.split("?")[1]).get("subject") ?? "");
    assert.ok(subject.includes("漢字でんしゃ"));
    subjects.add(subject);
  }
  assert.equal(subjects.size, KINDS.length, "each kind must have a distinct subject");
});

test("RefundModal and the parent support card both call buildSupportMailto -- no second mailto builder", () => {
  const refundModal = readFileSync("src/components/refund-modal.tsx", "utf8");
  const supportCard = readFileSync("src/components/parent-support-card.tsx", "utf8");
  assert.match(refundModal, /buildSupportMailto\(/);
  assert.match(supportCard, /buildSupportMailto\(/);
  // Neither component builds its own mailto body -- that logic lives in
  // exactly one place, refund-contact.ts.
  assert.equal(/\.join\(\s*"\\n"\s*\)/.test(refundModal), false);
  assert.equal(/\.join\(\s*"\\n"\s*\)/.test(supportCard), false);
});
