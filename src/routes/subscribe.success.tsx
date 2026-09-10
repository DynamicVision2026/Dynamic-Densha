import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ArrivalPass } from "@/components/ticket";
import { InstallGuide } from "@/components/install-guide";
import { Button } from "@/components/ui/button";
import { getPassState } from "@/lib/server/pass";
import { FAST_WINDOW_MS, pollIntervalMs, successView } from "@/lib/checkout-poll";
import { trainNameOrDefault } from "@/lib/commerce-copy";
import { saveCommuterPassPng } from "@/lib/ticket-png";
import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";
import type { Plan } from "@/lib/subscription-derive";

/**
 * Where a parent lands after paying -- from Shopify's own order-status page
 * redirect, and (more often, because a meaningful share of parents never
 * reach that page at all) from the 保護者ページを開く link in the order
 * confirmation email.
 *
 * This route NEVER grants entitlement. That happens in
 * src/routes/api/webhooks/shopify.ts and nowhere else; a return URL is a
 * browser's say-so, forgeable by anyone who reads it once. Here we poll the
 * derived state and show one of three screens (spec §1.3) -- and there is
 * deliberately no error state, because a webhook that hasn't landed yet is
 * not a failure and nothing observable here tells "slow" from "failed".
 *
 * Idempotent by construction: a parent who opens the email link three days
 * later resolves straight to `active` and sees the pass. This is a
 * permanent view of entitlement, not a one-time confirmation.
 */
export const Route = createFileRoute("/subscribe/success")({
  component: SubscribeSuccess,
});

function SubscribeSuccess() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();

  // Fixed at mount: the window is measured from when this screen first
  // appeared, not from each render.
  const [startedAt] = useState(() => Date.now());
  const [pastFastWindow, setPastFastWindow] = useState(false);

  const passQ = useQuery({
    queryKey: ["pass-state"],
    queryFn: () => getPassState(),
    enabled: Boolean(user),
    refetchInterval: (query) =>
      pollIntervalMs({
        active: query.state.data?.active === true,
        elapsedMs: Date.now() - startedAt,
      }),
  });

  // The pending → slow switch is driven by its own timer rather than left to
  // whenever the next poll happens to re-render: at the 10s interval that
  // would otherwise leave a parent staring at the fast-window copy for up to
  // ten seconds after it stopped being true.
  useEffect(() => {
    const id = setTimeout(() => setPastFastWindow(true), FAST_WINDOW_MS);
    return () => clearTimeout(id);
  }, []);

  if (isPending) return null;
  if (!user) {
    // The email link is the primary return path (§1.2) and may be opened
    // days later on a device with no session, so sign-in has to come back
    // here rather than dumping the parent on the dashboard.
    return <RedirectToSignIn to={`/login?next=${encodeURIComponent("/subscribe/success")}`} />;
  }

  const active = passQ.data?.active === true;
  const view = successView({
    active,
    elapsedMs: pastFastWindow ? FAST_WINDOW_MS : Date.now() - startedAt,
  });

  return (
    <main className="paper-wash grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md text-center" data-success-view={view}>
        {view === "confirmed" ? (
          <Confirmed plan={passQ.data?.plan ?? null} paidUntil={passQ.data?.paidUntil ?? null} />
        ) : view === "pending" ? (
          <>
            <TicketPrinting />
            <p className="mt-6 font-display text-xl">{t("checkoutPendingTitle")}</p>
          </>
        ) : (
          <>
            <p className="font-display text-xl">{t("checkoutTimeoutTitle")}</p>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{t("checkoutTimeoutBody")}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-6"
              onClick={() => window.location.reload()}
            >
              {t("successSlowReload")}
            </Button>
          </>
        )}
      </div>
    </main>
  );

}

function Confirmed({ plan, paidUntil }: { plan: Plan | null; paidUntil: string | null }) {
  const { t, locale } = useI18n();
  const validityLabel =
    plan === "annual" && paidUntil ? dateWithYearLabel(paidUntil, locale) : t("passValidityForever");
  const planLabel =
    plan === "buyout"
      ? t("planCardFamilyTitle")
      : plan === "annual"
        ? t("planCardAnnualTitle")
        : t("currentPlanGeneric");

  return (
    <>
      <ArrivalPass plan={plan} paidUntil={paidUntil} />

      {/* Riding is the primary action and the only vermilion button here. */}
      <a
        href="/app"
        data-ride-cta
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-5 font-display text-base text-primary-fg shadow-soft"
      >
        {t("successRideCta")}
      </a>
      <a
        href="/app/parent"
        className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-5 text-sm text-fg"
      >
        {t("successParentCta")}
      </a>

      {/* Never automatic: one button, one tap, one image. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-4"
        data-save-pass
        onClick={() => {
          void saveCommuterPassPng({
            // The train name, never the child's -- see saveCommuterPassPng.
            passenger: trainNameOrDefault(null),
            planLabel,
            validityLabel,
            title: t("passLabel"),
            validityCaption: t("passValidityLabel"),
          });
        }}
      >
        {t("passSaveButton")}
      </Button>

      <InstallGuide />
    </>
  );
}

/** A quiet ticket sliding out of a slot. Honours prefers-reduced-motion (see styles.css). */
function TicketPrinting() {
  return (
    <div aria-hidden className="mx-auto h-24 w-40 overflow-hidden" data-ticket-printing>
      <div className="mx-auto h-1.5 w-32 rounded-full bg-border-strong" />
      <div className="ticket-print mx-auto mt-1 h-16 w-32 border-2 border-border-strong bg-surface">
        <div className="mt-3 ml-3 h-2 w-16 bg-border" />
        <div className="mt-2 ml-3 h-2 w-10 bg-border" />
      </div>
    </div>
  );
}
