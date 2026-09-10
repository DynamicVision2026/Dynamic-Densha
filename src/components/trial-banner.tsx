import { trialEndDateLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";
import type { ParentTrialBanner } from "@/lib/entitlement";

/**
 * Parent-dashboard-only, strictly informational -- states what's true (the
 * trial's end date, or that the trial/plan has ended) in one plain
 * sentence, deliberately with no countdown, no color escalation, and no
 * purchase affordance of its own: the buy decision lives entirely in
 * <PlanCards> (plan-cards.tsx), rendered separately by ParentPage, so this
 * banner's copy and the purchase cards can each change independently.
 * Never rendered on the child surface.
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

  const body = banner.kind === "cancelled" ? "trialBannerCancelledBody" : "trialBannerEndedBody";
  return (
    <p
      data-trial-banner={banner.kind}
      className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted"
    >
      {t(body)}
    </p>
  );
}
