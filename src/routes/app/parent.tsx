import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ParentReportView } from "@/components/parent-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resetActiveGradeToProfile } from "@/lib/active-grade";
import {
  archiveChild,
  confirmGradeRollover,
  dismissGradeRollover,
  listChildren,
  renameChild,
  updateStartBand,
} from "@/lib/server/children";
import { ParentForwardView } from "@/components/parent-forward";
import { GradeRolloverCard } from "@/components/grade-rollover";
import { InstallGuide } from "@/components/install-guide";
import { StartBandPicker } from "@/components/start-band-picker";
import { TrialBanner } from "@/components/trial-banner";
import { PlanCards, CurrentPlanNotice } from "@/components/plan-cards";
import { PassAssignmentCard } from "@/components/pass-assignment-card";
import { assignAnnualPass, getPassAssignment } from "@/lib/server/pass";
import type { StartBand } from "@/lib/grade-route";
import { requestInsight } from "@/lib/server/insights";
import { getParentOverview } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { child?: string; checkout?: "pending"; already?: "active" };
export const Route = createFileRoute("/app/parent")({
  component: ParentPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    child: typeof s.child === "string" ? s.child : undefined,
    checkout: s.checkout === "pending" ? "pending" : undefined,
    already: s.already === "active" ? "active" : undefined,
  }),
});

/** src/routes/subscribe.ts's own return_url lands here. See its 30s-timeout note below. */
const CHECKOUT_POLL_INTERVAL_MS = 2000;
const CHECKOUT_POLL_TIMEOUT_MS = 30000;

function ParentPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const [childId, setChildId] = useState(search.child || readActiveChildId() || "");
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  // Parent surface only. Nothing on a child surface ever asks for this.
  const passQ = useQuery({ queryKey: ["pass-assignment"], queryFn: () => getPassAssignment() });
  const qc = useQueryClient();

  useEffect(() => {
    if (!childId && childrenQ.data?.[0]) {
      setChildId(childrenQ.data[0].id);
      writeActiveChildId(childrenQ.data[0].id);
    }
  }, [childId, childrenQ.data]);

  const isPendingCheckout = search.checkout === "pending";
  // Fixed at mount, not recomputed -- the 30s window is measured from when
  // this pending view first appeared, not from each render.
  const [pendingStartedAt] = useState(() => Date.now());

  const overviewQ = useQuery({
    queryKey: ["overview", childId],
    queryFn: () => getParentOverview({ data: childId }),
    enabled: Boolean(childId),
    // Shopify's webhook can land after the browser already returned here
    // (src/routes/subscribe.ts hands off to /handoff, which hands off to
    // Shopify; entitlement is only ever granted by src/routes/api/webhooks/
    // shopify.ts). Poll for up to 30s so the swap to the normal dashboard
    // happens as soon as that webhook actually lands, without ever claiming
    // success before it does.
    refetchInterval: (query) => {
      if (!isPendingCheckout) return false;
      if (query.state.data?.subscriptionActive) return false;
      if (Date.now() - pendingStartedAt >= CHECKOUT_POLL_TIMEOUT_MS) return false;
      return CHECKOUT_POLL_INTERVAL_MS;
    },
  });

  const insight = useMutation({
    mutationFn: () => requestInsight({ data: childId }),
  });

  const rolloverMut = useMutation({
    mutationFn: () => confirmGradeRollover({ data: { childId } }),
    onSuccess: (out) => {
      if (out.ok) resetActiveGradeToProfile(out.grade, childId);
      void childrenQ.refetch();
      void overviewQ.refetch();
    },
  });

  const dismissMut = useMutation({
    mutationFn: () => dismissGradeRollover({ data: { childId } }),
    onSuccess: () => {
      void overviewQ.refetch();
    },
  });

  const bandMut = useMutation({
    mutationFn: (startBand: StartBand) => updateStartBand({ data: { childId, startBand } }),
    onSuccess: () => {
      void overviewQ.refetch();
    },
  });

  const [renameValue, setRenameValue] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  useEffect(() => {
    setRenameValue(overviewQ.data?.child.name ?? "");
    setArchiveConfirm(false);
  }, [childId, overviewQ.data?.child.name]);

  const renameMut = useMutation({
    mutationFn: (name: string) => renameChild({ data: { childId, name } }),
    onSuccess: () => {
      void childrenQ.refetch();
      void overviewQ.refetch();
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveChild({ data: { childId } }),
    onSuccess: async () => {
      const next = await childrenQ.refetch();
      const remaining = next.data?.filter((c) => c.id !== childId) ?? [];
      const nextId = remaining[0]?.id ?? "";
      writeActiveChildId(nextId);
      setChildId(nextId);
      setArchiveConfirm(false);
    },
  });

  if (!childId || overviewQ.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const data = overviewQ.data;
  if (!data) return null;

  // src/routes/subscribe.ts's ultimate destination after /handoff. Entitlement
  // is granted by the Shopify webhook (src/routes/api/webhooks/shopify.ts),
  // which can land after this page does -- so this is a read-only wait for that webhook,
  // never a claim of success on its own (a return URL is just a browser's
  // say-so, forgeable by anyone who reads it once). subscriptionActive
  // flipping true is what ends it, driven entirely by overviewQ's own poll
  // above; there's nothing else to do here but render the right copy.
  if (isPendingCheckout && !data.subscriptionActive) {
    const timedOut = Date.now() - pendingStartedAt >= CHECKOUT_POLL_TIMEOUT_MS;
    return (
      <AppShell childName={data.child.name} grade={data.child.grade}>
        <main className="mx-auto max-w-md px-5 py-16 text-center" data-checkout-pending={timedOut ? "timeout" : "waiting"}>
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

  return (
    <AppShell childName={data.child.name} grade={data.child.grade}>
      <main data-parent-doc className="mx-auto max-w-[900px] px-5 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("parentPage")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("parentTitle")}</h1>

        {search.already === "active" ? (
          <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            {t("alreadyActiveNotice")}
          </p>
        ) : null}

        <div className="mt-4">
          <TrialBanner banner={data.trialBanner} />
          {data.trialBanner.isActive ? (
            <CurrentPlanNotice plan={data.trialBanner.plan} paidUntil={data.trialBanner.paidUntil} />
          ) : (
            <PlanCards />
          )}
        </div>

        {passQ.data ? (
          <PassAssignmentCard
            assignment={passQ.data}
            children={(childrenQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
            onAssign={async (id) => {
              const result = await assignAnnualPass({ data: { childId: id } });
              // Coverage changes what every child's board is allowed to do,
              // so the board's own cached entitlement has to go too.
              await Promise.all([
                passQ.refetch(),
                qc.invalidateQueries({ queryKey: ["overview"] }),
                qc.invalidateQueries({ queryKey: ["home"] }),
              ]);
              return result;
            }}
          />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {childrenQ.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              data-child-chip={c.id}
              className={`h-11 rounded-full border px-3 text-sm ${
                c.id === childId ? "border-fg bg-fg text-bg" : "border-border bg-surface"
              }`}
              onClick={() => {
                writeActiveChildId(c.id);
                setChildId(c.id);
              }}
            >
              {c.name}
            </button>
          ))}
          <Link
            to="/onboard"
            search={{ add: true }}
            data-add-child
            className="inline-flex h-11 items-center rounded-full border border-dashed border-border px-3 text-sm text-fg-muted"
          >
            ＋ {t("addChild")}
          </Link>
        </div>

        {data.report ? <ParentReportView report={data.report} /> : null}

        {data.forward && data.route && data.plan && data.progress ? (
          <ParentForwardView
            forward={data.forward}
            route={data.route}
            plan={data.plan}
            progress={data.progress}
            arrival={data.arrival}
            history={data.history}
          />
        ) : null}

        <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-settings>
          <StartBandPicker
            value={(data.child as { startBand?: StartBand }).startBand ?? "beginning"}
            onChange={(band) => bandMut.mutate(band)}
            disabled={bandMut.isPending}
          />
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-child-profile-manage>
          <h2 className="font-display text-lg">{t("childProfileManage")}</h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="child-rename">{t("renameChildLabel")}</Label>
              <Input
                id="child-rename"
                maxLength={20}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="max-w-[220px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={renameMut.isPending || !renameValue.trim() || renameValue.trim() === data.child.name}
              onClick={() => renameMut.mutate(renameValue.trim())}
            >
              {t("renameSave")}
            </Button>
          </div>
          {renameMut.isError ? (
            <p className="mt-1.5 text-sm text-destructive" data-rename-error>
              {renameMut.error instanceof Error ? renameMut.error.message : t("saveFailed")}
            </p>
          ) : null}

          {archiveMut.isError ? (
            <p className="mt-2 text-sm text-destructive" data-archive-error>
              {archiveMut.error instanceof Error ? archiveMut.error.message : t("saveFailed")}
            </p>
          ) : null}

          {archiveConfirm ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-warm p-3">
              <p className="text-sm text-fg-muted" data-archive-confirm>
                {t("archiveConfirmBody", { name: data.child.name })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={archiveMut.isPending}
                onClick={() => archiveMut.mutate()}
              >
                {t("archiveConfirmButton")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setArchiveConfirm(false)}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => setArchiveConfirm(true)}
            >
              {t("archiveChildButton")}
            </Button>
          )}
        </section>

        <GradeRolloverCard
          grade={data.child.grade}
          canRollover={Boolean(data.canRollover)}
          aprilPrompt={Boolean(data.aprilPrompt)}
          pending={rolloverMut.isPending}
          onConfirm={() => rolloverMut.mutate()}
          onDismiss={() => dismissMut.mutate()}
        />

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">{t("aiInsight")}</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={insight.isPending}
              onClick={() => insight.mutate()}
            >
              {insight.isPending ? t("writingInsight") : t("askInsight")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">{t("insightHint")}</p>
          {insight.data?.ok ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-fg">{insight.data.text}</p>
          ) : insight.data && !insight.data.ok ? (
            <p className="mt-4 text-sm text-fg-muted">{insight.data.error}</p>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">{t("noInsight")}</p>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">{t("recentStudy")}</h2>
            <Link
              to="/app/child/$childId/mistakes"
              params={{ childId }}
              className="text-sm text-fg-muted underline-offset-4 hover:underline"
            >
              {t("mistakes")}
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {data.recent.length === 0 ? (
              <li className="py-6 text-sm text-fg-muted">{t("noRecent")}</li>
            ) : (
              data.recent.map((ev, i) => (
                <li key={`${ev.created_at}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-display text-lg">{ev.kanji}</span>
                  <span className="text-fg-muted">{ev.kind}</span>
                  <span className={ev.correct ? "text-status-perfect" : "text-status-lost"}>
                    {ev.correct ? t("correct") : t("wrong")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Below everything, and self-hiding once the app is already on the
            home screen -- /subscribe/success is seen exactly once, so this is
            the second and last place a parent can pick the guide up. */}
        <InstallGuide />

        <p className="mt-10 text-center text-[11px] leading-relaxed text-fg-subtle" data-parent-licenses>
          {t("shapeLicense")}
          <br />
          {t("audioLicense")}
        </p>
      </main>
    </AppShell>
  );
}
