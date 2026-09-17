import { buildSupportMailto } from "@/lib/refund-contact";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * お問い合わせ・サポート. PARENT SURFACE ONLY -- see parent-ia.test.ts's
 * "nothing the parent hub adds can reach a child surface", which this file
 * is on the parentOnly list for.
 *
 * A general support entry point beside the narrower 返金についてのご相談
 * button: this one is for product questions and bug reports too, not just
 * refunds, and it drafts its mail directly (kind: "support") rather than
 * opening a dialog first -- there is no policy text a parent needs to read
 * before asking a question, unlike a refund request.
 */
export function ParentSupportCard({
  orderName,
  email,
}: {
  orderName: string | null;
  email: string | null;
}) {
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5 sm:p-6" data-contact-card>
      <div className="flex items-start gap-3">
        <MailGlyph />
        <div>
          <h2 className="font-display text-lg">{t("contactCardTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-muted">{t("contactCardBody")}</p>
          <p className="mt-1 text-xs text-fg-subtle">{t("contactCardSla")}</p>
        </div>
      </div>

      <a
        href={buildSupportMailto({ kind: "support", context: { orderName, email } })}
        data-contact-mailto
        className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border bg-bg px-4 text-sm"
      >
        {t("contactCardCta")}
      </a>
      <p className="mt-2 text-xs text-fg-subtle">{t("contactFallback")}</p>
    </section>
  );
}

/** A hand-drawn envelope, stroke-only -- matches the line weight used elsewhere
 * (speaker-button.tsx) rather than a filled system glyph that would clash
 * with an emoji-rendered icon on iOS. */
function MailGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-6 shrink-0 text-fg-muted"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}
