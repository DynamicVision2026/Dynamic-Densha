import { trialEndDateLabel } from "@/lib/trial-clock";
import { monthlyCheckoutUrl, yearlyCheckoutUrl } from "@/lib/checkout-link";
import { useI18n } from "@/lib/i18n/i18n";
import type { ParentTrialBanner } from "@/lib/entitlement";

/**
 * Parent-dashboard-only. Shown from a household's very first visit onward
 * while trialing (not just near the end) so the trial's end date is never
 * a surprise, and shown as a clear dead-end-with-an-exit once it's over —
 * whether that trial ran its normal course or was backdated to zero
 * because this email already spent one (spec §2.2). Never rendered on the
 * child surface.
 *
 * `checkoutToken` is this household's opaque checkout_token (see
 * src/lib/server/household.ts) -- both buttons below append it as
 * ?client_reference_id so a completed Stripe checkout can be attributed
 * back to this household without ever exposing household_id itself or
 * resolving anything by email.
 */
export function TrialBanner({ banner }: { banner: ParentTrialBanner & { checkoutToken: string } }) {
  const { t, locale } = useI18n();

  if (banner.kind === "none") return null;

  if (banner.kind === "trialing") {
    return (
      <p
        data-trial-banner="trialing"
        className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted"
      >
        {t("trialBannerActive", { date: trialEndDateLabel(banner.trialEndsAt, locale) })}
      </p>
    );
  }

  const [title, body] =
    banner.kind === "cancelled"
      ? (["trialBannerCancelledTitle", "trialBannerCancelledBody"] as const)
      : (["trialBannerEndedTitle", "trialBannerEndedBody"] as const);

  return (
    <section
      data-trial-banner={banner.kind}
      className="rounded-xl border border-primary bg-surface px-4 py-3 text-sm"
    >
      <p className="font-display text-base">{t(title)}</p>
      <p className="mt-1 text-fg-muted">{t(body)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={monthlyCheckoutUrl(banner.checkoutToken)}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-fg"
        >
          {t("trialBannerSubscribeMonthly")}
        </a>
        <a
          href={yearlyCheckoutUrl(banner.checkoutToken)}
          className="inline-flex h-10 items-center rounded-lg border border-primary px-4 text-sm text-primary"
        >
          {t("trialBannerSubscribeYearly")}
        </a>
      </div>
    </section>
  );
}
