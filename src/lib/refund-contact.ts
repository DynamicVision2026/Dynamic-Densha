/**
 * The support enquiry mail, for all three reasons a parent writes in:
 * general product/payment questions, a 返金・ご解約 request, and a bug
 * report.
 *
 * Deliberately NOT i18n keys. The subject and the field labels are an
 * outbound protocol between this app and info@kanji-ai.jp: support reads and
 * filters Japanese, so a parent browsing in English must still send a subject
 * line that lands in the right place. Localising it would quietly break
 * triage for exactly the customers who need it most. Same call, and the same
 * reason, as src/lib/commerce-copy.ts.
 *
 * Alias-free so the plain node test runner can check the encoding.
 *
 * The diagnostics block appended to every body is deliberately limited to
 * {app version, order name, timestamp} -- see buildSupportMailto's own
 * comment. It must never grow a child name, child id, household id,
 * progress/practice data, or a refund-eligibility verdict: support looks the
 * order up by order name, nothing here needs to identify a child, and
 * scripts/refund-contact.test.ts holds that line.
 */

export const SUPPORT_EMAIL = "info@kanji-ai.jp";
/** Manually bumped; there is no build-time version injection in this app. */
export const APP_VERSION = "1.0.0";

// Kept for the existing call sites/tests that predate buildSupportMailto.
export const REFUND_EMAIL = SUPPORT_EMAIL;

const SUBJECTS = {
  support: "【お問い合わせ】漢字でんしゃ",
  refund: "【返金・解約のご相談】漢字でんしゃ",
  bug: "【不具合のご報告】漢字でんしゃ",
} as const;

export const REFUND_SUBJECT = SUBJECTS.refund;

export type SupportMailtoKind = keyof typeof SUBJECTS;

export type SupportMailtoContext = {
  orderName: string | null;
  email: string | null;
};

const BODY_INTRO: Record<SupportMailtoKind, string> = {
  support: "（お問い合わせ）",
  refund: "（ご返金・ご解約のご相談）",
  bug: "（不具合のご報告）",
};

const BODY_PROMPT: Record<SupportMailtoKind, string> = {
  support: "ご相談内容をお聞かせください:",
  refund: "ご利用の感想や、うまくいかなかったことがあれば、お聞かせください:",
  bug: "どの画面で、どのような不具合が発生したか、できるだけ詳しくお聞かせください:",
};

/**
 * Pre-fills what support would otherwise have to ask for -- the order number
 * and the account the purchase sits under -- and leaves the one thing only
 * the parent can supply as an open line. A blank mail body means a round trip
 * before anyone can even look up the order.
 *
 * The "サポート情報" block at the end is machine-readable triage context,
 * not something a parent is meant to edit -- app version, the order name
 * again (as `参照`, so it survives even if the parent deletes the line
 * above it), and when the mail was drafted. It is intentionally the
 * smallest useful diagnostic: no child name, child id, household id, or
 * anything about what or how much the child has practiced. A parent's
 * support request is about their account and their purchase, never their
 * child's record, and nothing upstream of this function even has a child
 * in scope to pass in (SupportMailtoContext has no such field).
 */
export function buildSupportMailto({
  kind,
  context,
}: {
  kind: SupportMailtoKind;
  context: SupportMailtoContext;
}): string {
  const body = [
    BODY_INTRO[kind],
    "",
    `ご注文番号: ${context.orderName ?? "（不明）"}`,
    `ご登録メールアドレス: ${context.email ?? "（不明）"}`,
    "",
    BODY_PROMPT[kind],
    "",
    "---",
    "サポート情報（変更しないでください）",
    `アプリ: v${APP_VERSION}`,
    `参照: ${context.orderName ?? "—"}`,
    `日時: ${new Date().toISOString()}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUBJECTS[kind])}&body=${encodeURIComponent(body)}`;
}

export function refundMailtoHref(input: SupportMailtoContext): string {
  return buildSupportMailto({ kind: "refund", context: input });
}
