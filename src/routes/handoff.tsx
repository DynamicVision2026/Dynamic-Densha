import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resolveHandoff, type HandoffResult } from "@/lib/server/handoff";
import { OutboundTicket, StatementNotice } from "@/components/ticket";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { plan?: string };

export const Route = createFileRoute("/handoff")({
  component: Handoff,
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
});

/** An explicit predicate rather than an inline `kind === "checkout"` ternary: the discriminated union does not narrow through useQuery's `data` on its own. */
function isCheckout(
  result: HandoffResult | undefined,
): result is Extract<HandoffResult, { kind: "checkout" }> {
  return result?.kind === "checkout";
}

function Handoff() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const search = Route.useSearch();
  const plan = search.plan ?? "";

  const handoffQ = useQuery({
    queryKey: ["handoff", plan],
    queryFn: () => resolveHandoff({ data: { planParam: plan } }),
    enabled: Boolean(user) && Boolean(plan),
  });

  const checkout = isCheckout(handoffQ.data) ? handoffQ.data : undefined;
  // A config/lookup failure (missing Shopify env var on this revision, DB
  // error, etc.) -- distinct from handoffQ.isError below, which only ever
  // covers the network/transport layer. This is the server successfully
  // responding "I could not build a checkout link", and it must render
  // something a visitor can see and act on: bouncing this to /app/parent
  // silently is indistinguishable, from the visitor's side, from a signup
  // that just quietly ends -- which is the exact failure mode this route
  // exists to prevent.
  const configError = handoffQ.data?.kind === "error";

  // Bounce the other non-checkout outcomes (bad plan, already active, no
  // plan at all) straight to the dashboard -- those are real decisions with
  // an obvious next destination. A transport-level failure (handoffQ.isError)
  // or a server-reported config error is not: see the visible states below
  // instead of a silent redirect for either.
  useEffect(() => {
    if (!plan) {
      window.location.href = "/app/parent";
      return;
    }
    if (handoffQ.data && handoffQ.data.kind !== "checkout" && handoffQ.data.kind !== "error") {
      window.location.href = handoffQ.data.kind === "already-active" ? "/app/parent?already=active" : "/app/parent";
    }
  }, [plan, handoffQ.data]);

  if (isPending) return null;
  if (!user) {
    // /handoff isn't itself allow-listed as a post-auth destination, so this
    // resolves to /app after sign-in -- the plan param is carried anyway in
    // case that list ever widens.
    return <RedirectToSignIn next={`/handoff${plan ? `?plan=${encodeURIComponent(plan)}` : ""}`} />;
  }

  if (configError || handoffQ.isError) {
    return (
      <main className="paper-wash grid min-h-dvh place-items-center px-5 py-10">
        <div className="w-full max-w-md text-center">
          <p className="font-display text-xl">{t("handoffErrorTitle")}</p>
          <p className="mt-2 text-sm leading-6 text-fg-muted">{t("handoffErrorBody")}</p>
          <a
            href="https://kanji-ai.jp/contact.html"
            data-checkout-support-link
            className="mt-6 inline-block text-sm text-fg-muted underline-offset-4 hover:underline"
          >
            {t("checkoutSupportLink")}
          </a>
        </div>
      </main>
    );
  }

  // No auto-redirect. This screen now carries the price, the non-renewal
  // terms, the issuing company and the statement descriptor -- all of it
  // there to be READ before money moves, which a two-second timer to a
  // third-party origin actively prevents. The parent taps when ready.
  return (
    <main className="paper-wash grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md text-center">
        <p className="font-display text-xl">{t("handoffTitle")}</p>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          {t("handoffBody", { domain: checkout?.domain ?? "" })}
        </p>

        <div className="mt-6">{checkout ? <OutboundTicket plan={checkout.plan} /> : null}</div>
        <StatementNotice />

        {checkout?.accountEmail ? (
          <p className="mt-6 text-xs text-fg-muted">{t("handoffEmailNotice", { email: checkout.accountEmail })}</p>
        ) : null}

        {checkout ? (
          <a
            href={checkout.checkoutUrl}
            data-checkout-cta
            className="mt-6 inline-flex h-12 w-full max-w-[420px] items-center justify-center rounded-lg bg-primary px-5 text-sm text-primary-fg shadow-soft"
          >
            {t("checkoutCta")}
          </a>
        ) : null}

        <p className="mt-6 text-xs text-fg-subtle">
          <a
            href="https://kanji-ai.jp/tokushoho.html"
            className="underline-offset-4 hover:underline"
          >
            {t("tokushoho")}
          </a>
        </p>
      </div>
    </main>
  );
}
