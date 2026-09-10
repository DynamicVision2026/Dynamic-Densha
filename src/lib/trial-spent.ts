/**
 * Trial-abuse prevention (commerce spec §2.2): a household's trial is a
 * one-time grant per parent email, keyed on trial_spent.email_hash. This
 * file is pure hashing only -- the check-and-record against the trial_spent
 * table happens in server/household.ts, which is DB-touching glue and not
 * unit-testable outside the live app (same pure/glue split as
 * shopify-signature.ts vs server/webhooks.ts elsewhere in this repo).
 */
import { createHash } from "node:crypto";

/** Normalizes case/whitespace so the same address always hashes the same. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
