/**
 * The 返金・ご解約 enquiry mail.
 *
 * Deliberately NOT i18n keys. The subject and the field labels are an
 * outbound protocol between this app and info@kanji-ai.jp: support reads and
 * filters Japanese, so a parent browsing in English must still send a subject
 * line that lands in the right place. Localising it would quietly break
 * triage for exactly the customers who need it most. Same call, and the same
 * reason, as src/lib/commerce-copy.ts.
 *
 * Alias-free so the plain node test runner can check the encoding.
 */

export const REFUND_EMAIL = "info@kanji-ai.jp";
export const REFUND_SUBJECT = "【返金・解約のご相談】漢字でんしゃ";

/**
 * Pre-fills what support would otherwise have to ask for -- the order number
 * and the account the purchase sits under -- and leaves the one thing only
 * the parent can supply as an open line. A blank mail body means a round trip
 * before anyone can even look up the order.
 */
export function refundMailtoHref(input: { orderName: string | null; email: string | null }): string {
  const body = [
    "（ご返金・ご解約のご相談）",
    "",
    `ご注文番号: ${input.orderName ?? "（不明）"}`,
    `ご登録メールアドレス: ${input.email ?? "（不明）"}`,
    "",
    "ご利用の感想や、うまくいかなかったことがあれば、お聞かせください:",
    "",
  ].join("\n");
  return `mailto:${REFUND_EMAIL}?subject=${encodeURIComponent(REFUND_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
