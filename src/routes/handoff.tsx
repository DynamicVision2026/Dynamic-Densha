import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resolveHandoff } from "@/lib/server/handoff";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { plan?: string };

export const Route = createFileRoute("/handoff")({
  component: Handoff,
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
});

// Long enough to read the domain + Tokushoho link, short enough that
// nobody's actually waiting on it -- the manual link below covers anyone
// who wants to skip the wait or whose browser blocks the auto-navigation.
const REDIRECT_DELAY_MS = 2000;

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

  const checkoutUrl = handoffQ.data?.kind === "checkout" ? handoffQ.data.checkoutUrl : undefined;

  useEffect(() => {
    if (!checkoutUrl) return;
    const id = setTimeout(() => {
      window.location.href = checkoutUrl;
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(id);
  }, [checkoutUrl]);

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

  return (
    <main className="paper-wash grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-soft sm:p-8">
        <p className="font-display text-xl">{t("handoffTitle")}</p>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          {t("handoffBody", { domain: handoffQ.data?.kind === "checkout" ? handoffQ.data.domain : "" })}
        </p>
        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm text-primary-fg"
          >
            {t("handoffManualLink")}
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
