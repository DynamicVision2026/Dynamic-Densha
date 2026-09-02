import { trialEndDateLabel } from "@/lib/trial-clock";
import { SUBSCRIBE_HREF } from "@/lib/subscribe-link";
import { useI18n } from "@/lib/i18n/i18n";
import type { ParentTrialBanner } from "@/lib/entitlement";

/**
 * Parent-dashboard-only. Shown from a household's very first visit onward
 * while trialing (not just near the end) so the trial's end date is never
 * a surprise, and shown as a clear dead-end-with-an-exit once it's over —
 * whether that trial ran its normal course or was backdated to zero
 * because this email already spent one (spec §2.2). Never rendered on the
 * child surface.
 */
export function TrialBanner({ banner }: { banner: ParentTrialBanner }) {
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
      <a
        href={SUBSCRIBE_HREF}
        className="mt-3 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-fg"
      >
        {t("trialBannerSubscribeCta")}
      </a>
    </section>
  );
}
