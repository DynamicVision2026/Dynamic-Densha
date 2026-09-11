import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId } from "@/lib/active-child";
import { resolveInitialChildId } from "@/lib/child-route-resolve";
import { listChildren } from "@/lib/server/children";
import { getPassState } from "@/lib/server/pass";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { child?: string; checkout?: "pending"; already?: "active" };

export const Route = createFileRoute("/app/parent/")({
  component: ParentResolver,
  validateSearch: (s: Record<string, unknown>): Search => ({
    // Still honoured. Ten places linked here with ?child= before the split --
    // ParentDoor on every child board, the mistakes back-link, /subscribe's
    // fallbacks -- and some of those URLs are in browser histories.
    child: typeof s.child === "string" ? s.child : undefined,
    checkout: s.checkout === "pending" ? "pending" : undefined,
    already: s.already === "active" ? "active" : undefined,
  }),
});

/** src/routes/subscribe.ts's own return_url lands here. See the timeout note below. */
const CHECKOUT_POLL_INTERVAL_MS = 2000;
const CHECKOUT_POLL_TIMEOUT_MS = 30000;

/**
 * /app/parent is now a resolver, not a page.
 *
 * It answers one question -- whose report? -- and forwards to
 * /app/parent/report/$childId, where the report lives. Same shape as /app
 * itself, deliberately: two surfaces resolving "which child" two different
 * ways is how they drift apart.
 *
 * It also owns the post-checkout wait, which belongs here rather than on a
 * report: whether the household's payment has landed is a HOUSEHOLD question,
 * and asking it through one child's report was only ever incidental.
 */
function ParentResolver() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const isPendingCheckout = search.checkout === "pending";

  // Fixed at mount, not recomputed -- the 30s window is measured from when
  // this pending view first appeared, not from each render.
  const [pendingStartedAt] = useState(() => Date.now());

  // Household-level, and cheap: getPassState reports the derived entitlement
  // without the whole per-child report the old version had to load just to
  // read one boolean off it.
  const passQ = useQuery({
    queryKey: ["pass-state"],
    queryFn: () => getPassState(),
    enabled: isPendingCheckout,
    // Shopify's webhook can land after the browser already returned here
    // (entitlement is only ever granted by src/routes/api/webhooks/shopify.ts).
    // Poll for up to 30s so the swap to the dashboard happens as soon as that
    // webhook lands, without ever claiming success before it does.
    refetchInterval: (query) => {
      if (!isPendingCheckout) return false;
      if (query.state.data?.active) return false;
      if (Date.now() - pendingStartedAt >= CHECKOUT_POLL_TIMEOUT_MS) return false;
      return CHECKOUT_POLL_INTERVAL_MS;
    },
  });

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });

  // A return URL is a browser's say-so, forgeable by anyone who reads it once,
  // so this is a read-only wait for the webhook and never a claim of success.
  if (isPendingCheckout && !passQ.data?.active) {
    const timedOut = Date.now() - pendingStartedAt >= CHECKOUT_POLL_TIMEOUT_MS;
    return (
      <AppShell>
        <main
          className="mx-auto max-w-md px-5 py-16 text-center"
          data-checkout-pending={timedOut ? "timeout" : "waiting"}
        >
          {timedOut ? (
            <>
              <p className="font-display text-xl">{t("checkoutTimeoutTitle")}</p>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{t("checkoutTimeoutBody")}</p>
            </>
          ) : (
            <>
              <Skeleton className="mx-auto h-10 w-10 rounded-full" />
              <p className="mt-4 font-display text-xl">{t("checkoutPendingTitle")}</p>
            </>
          )}
        </main>
      </AppShell>
    );
  }

  if (!childrenQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-5">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  // An explicit ?child= wins if it still names a living child of this
  // household; otherwise the device hint; otherwise the first child.
  const explicit = search.child && childrenQ.data.some((c) => c.id === search.child) ? search.child : null;
  const childId = explicit ?? resolveInitialChildId(childrenQ.data, readActiveChildId());

  // No children at all: settings is the only hub with anything to show, and
  // it carries the 「＋ お子さまを追加」 entry point.
  if (!childId) return <Navigate to="/app/parent/settings" replace />;

  return (
    <Navigate
      to="/app/parent/report/$childId"
      params={{ childId }}
      search={search.already === "active" ? { already: "active" } : {}}
      replace
    />
  );
}
