import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";
import type { Plan } from "@/lib/subscription-derive";

/**
 * Parent-dashboard-only purchase affordance, decoupled from the (purely
 * informational) TrialBanner -- see its own comment. Rendered by
 * ParentPage whenever the household isn't currently active
 * (data.trialBanner.isActive === false); <CurrentPlanNotice> below takes
 * its place once it is. Never rendered on the child surface (spec
 * invariant 5: no price/tier/paywall affordance there in any state).
 *
 * Plain <a href> anchors, not TanStack <Link> -- /subscribe is a
 * server-only `server: { handlers }` route with no client-rendered
 * component to navigate to, so a real browser GET has to hit its handler
 * (same reasoning as login.tsx's post-auth navigations).
 */
export function PlanCards() {
  const { t } = useI18n();
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2" data-plan-cards>
      <a
        href="/subscribe?plan=buyout"
        className="relative block rounded-xl border-2 border-primary bg-surface p-4 shadow-soft"
      >
        <span className="absolute -top-2.5 right-4 rounded-full bg-status-perfect px-2 py-0.5 text-[11px] font-medium leading-none text-status-perfect-fg">
          {t("trialBannerRecommended")}
        </span>
        <p className="font-display text-base">{t("planCardFamilyTitle")}</p>
        <p className="mt-1 font-display text-2xl">
          ¥9,800<span className="ml-1 font-sans text-xs text-fg-muted">{t("planCardOneTime")}</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">{t("planCardFamilySubtitle")}</p>
      </a>
      <a
        href="/subscribe?plan=annual"
        className="block rounded-xl border border-border bg-surface p-4 shadow-soft"
      >
        <p className="font-display text-base">{t("planCardAnnualTitle")}</p>
        <p className="mt-1 font-display text-2xl">
          ¥3,800<span className="ml-1 font-sans text-xs text-fg-muted">{t("planCardPerYear")}</span>
        </p>
      </a>
    </div>
  );
}

/**
 * <PlanCards>'s counterpart for an already-active household -- no purchase
 * affordance once entitled (never a reason to show a family a card for a
 * plan they already hold). `paidUntil` is only ever non-null for `annual`;
 * `plan` itself can be null on the rare unmatched-variant edge case (see
 * subscription-derive.ts's order_paid comment) -- entitlement never
 * depends on it, so this just falls back to a generic notice rather than
 * guessing which plan it was.
 */
export function CurrentPlanNotice({ plan, paidUntil }: { plan: Plan | null; paidUntil: string | null }) {
  const { t, locale } = useI18n();
  const text =
    plan === "buyout"
      ? t("currentPlanFamily")
      : plan === "annual" && paidUntil
        ? t("currentPlanAnnual", { date: dateWithYearLabel(paidUntil, locale) })
        : t("currentPlanGeneric");
  return (
    <p data-current-plan className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
      {text}
    </p>
  );
}
