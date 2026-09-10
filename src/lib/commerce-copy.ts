/**
 * The fixed, non-translated strings a purchase screen has to state exactly:
 * the statement descriptor, the corporate identity behind the charge, and
 * the prices. Pure and free of `@/` path aliases so the plain node test
 * runner can read them directly (same reasoning as subscribe-resolve.ts).
 *
 * These are deliberately NOT i18n keys. A parent disputing a charge matches
 * what their bank shows against what this screen said, and a bank statement
 * is not localised -- rendering the descriptor differently per locale would
 * defeat the entire purpose of showing it.
 */
import type { Plan } from "./subscription-derive";

/**
 * What a parent will see on their card statement. `SP` is Shopify Payments'
 * own prefix, so `BC-KANJIDENSHA` is the only configurable half.
 *
 * This string has to be identical in four places or it does no work: this
 * app's handoff screen (src/components/ticket.tsx), the Shopify order
 * confirmation email, the parent-facing payment history, and tokushoho.html
 * on the landing site. The two outside this repo are Shopify Admin and
 * landingpage-densha respectively -- see docs/commerce-launch-checklist.md.
 * If a real statement ever shows something different, correct all four to
 * match the statement, never the other way round.
 */
export const STATEMENT_DESCRIPTOR = "SP BC-KANJIDENSHA";

/** The legal entity behind the charge, as it appears on the ticket and in 特商法 copy. */
export const CORPORATE_NAME = "Beyond Culture 獨歩文化株式会社";

/** Tax-inclusive price per plan, as displayed. One source, so a ticket and a plan card can never disagree. */
export const PLAN_PRICE_JPY: Record<Plan, string> = {
  buyout: "¥9,800",
  annual: "¥3,800",
};

/**
 * The passenger line on the saveable 定期券 is the TRAIN name, never the
 * child's name -- the pass is designed to be saved, shared and printed, and
 * the parity rule is that a shareable ticket image carries no PII. A
 * parent-chosen train name is the child's own thing rather than their
 * personal data, and this default is a better passenger line than a real
 * name anyway.
 */
export const DEFAULT_TRAIN_NAME = "わたしのれっしゃ号";

/** No train-name feature exists yet, so every current caller lands on the default; this is where that changes when one does. */
export function trainNameOrDefault(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : DEFAULT_TRAIN_NAME;
}
