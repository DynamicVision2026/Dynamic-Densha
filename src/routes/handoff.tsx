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

  // Bounce non-checkout outcomes (bad plan, already active, no plan at all,
  // or the lookup itself failing) straight to the dashboard -- /handoff has
  // nothing useful to show for any of those, and stranding a visitor on a
  // blank page is worse than a redirect they didn't explicitly ask for.
  useEffect(() => {
    if (!plan) {
      window.location.href = "/app/parent";
      return;
    }
    if (handoffQ.data && handoffQ.data.kind !== "checkout") {
      window.location.href = handoffQ.data.kind === "already-active" ? "/app/parent?already=active" : "/app/parent";
      return;
    }
    if (handoffQ.isError) window.location.href = "/app/parent";
  }, [plan, handoffQ.data, handoffQ.isError]);

  if (isPending) return null;
  if (!user) {
    const next = `/handoff${plan ? `?plan=${encodeURIComponent(plan)}` : ""}`;
    return <RedirectToSignIn to={`/login?next=${encodeURIComponent(next)}`} />;
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
