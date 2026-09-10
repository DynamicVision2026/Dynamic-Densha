import { trialEndDateLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";
import type { ParentTrialBanner } from "@/lib/entitlement";

/**
 * Parent-dashboard-only. Shown from a household's very first visit onward
 * while trialing (not just near the end) so the trial's end date is never
 * a surprise, and shown as a clear dead-end-with-an-exit once it's over —
 * whether that trial ran its normal course or an annual pass lapsed
 * naturally (spec §2.2 / entitlement.ts's paid_until check). Never rendered
 * on the child surface.
 *
 * Both buttons are plain `<a href="/subscribe?...">` (never a TanStack
 * `<Link>`) on purpose -- /subscribe is a server-only `server: { handlers }`
 * route with no client-rendered component to navigate to, the same as the
 * old Stripe links (external hrefs) were. A real browser GET is what has to
 * hit its handler; the previous checkoutToken/client_reference_id plumbing
 * this file used to build here now happens server-side in /subscribe and
 * /handoff instead.
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
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <a
          href="/subscribe?plan=buyout"
          className="relative inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-fg"
        >
          {t("trialBannerSubscribeBuyout")}
          <span className="absolute -top-2.5 right-2 rounded-full bg-status-perfect px-1.5 py-0.5 text-[10px] font-medium leading-none text-status-perfect-fg">
            {t("trialBannerRecommended")}
          </span>
        </a>
        <a
          href="/subscribe?plan=annual"
          className="inline-flex h-10 items-center rounded-lg border border-primary px-4 text-sm text-primary"
        >
          {t("trialBannerSubscribeAnnual")}
        </a>
      </div>
    </section>
  );
}
