import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOverview, type AdminHouseholdRow } from "@/lib/server/admin";
import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { t, locale } = useI18n();
  const overviewQ = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
    retry: false,
  });

  // Any failure -- unauthenticated, signed in but not an admin, or the query
  // itself erroring -- bounces to /app uniformly. The server function is the
  // real gate (throws before any household row is ever returned); this is
  // just where to land once it has.
  useEffect(() => {
    if (overviewQ.isError) window.location.href = "/app";
  }, [overviewQ.isError]);

  if (overviewQ.isLoading || overviewQ.isError || !overviewQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const { summary, households } = overviewQ.data;

  return (
    <AppShell>
      <main data-admin-doc className="mx-auto max-w-[1100px] px-5 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("adminPage")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("adminTitle")}</h1>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-admin-summary>
          <SummaryCard label={t("adminTotalHouseholds")} value={summary.totalHouseholds} />
          <SummaryCard
            label={t("adminActivePaid")}
            value={summary.activePaidBuyout + summary.activePaidAnnual}
            detail={t("adminActivePaidDetail", {
              buyout: summary.activePaidBuyout,
              annual: summary.activePaidAnnual,
            })}
          />
          <SummaryCard label={t("adminActiveTrials")} value={summary.activeTrials} />
          <SummaryCard label={t("adminLapsed")} value={summary.lapsedInactive} />
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface" data-admin-table>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-normal">{t("adminColParent")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColRegistered")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColStatus")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColPlan")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColValidUntil")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColChildren")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColOrder")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {households.map((h) => (
                <AdminRow key={h.householdId} row={h} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-fg-muted">{detail}</p> : null}
    </div>
  );
}

function AdminRow({ row, locale }: { row: AdminHouseholdRow; locale: string }) {
  const { t } = useI18n();
  const statusCls =
    row.status === "active"
      ? "bg-status-perfect text-status-perfect-fg"
      : row.status === "trial"
        ? "bg-status-fix text-status-fix-fg"
        : "bg-status-lost text-status-lost-fg";
  const statusLabel =
    row.status === "active" ? t("adminStatusActive") : row.status === "trial" ? t("adminStatusTrial") : t("adminStatusLapsed");
  const planLabel =
    row.plan === "buyout" ? t("planCardFamilyTitle") : row.plan === "annual" ? t("planCardAnnualTitle") : t("adminPlanNone");

  return (
    <tr data-admin-row data-household-id={row.householdId}>
      <td className="px-4 py-3">
        <div>{row.ownerName ?? "—"}</div>
        <div className="text-xs text-fg-muted">{row.ownerEmail ?? "—"}</div>
      </td>
      <td className="px-4 py-3">{dateWithYearLabel(row.createdAt, locale)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusCls}`}>{statusLabel}</span>
      </td>
      <td className="px-4 py-3">{planLabel}</td>
      <td className="px-4 py-3">
        {row.validUntilKind === "unlimited"
          ? t("adminValidUntilUnlimited")
          : row.validUntilKind === "date" && row.validUntilIso
            ? dateWithYearLabel(row.validUntilIso, locale)
            : "—"}
      </td>
      <td className="px-4 py-3">
        {row.childCount}
        {row.childNames.length ? <span className="ml-1 text-xs text-fg-muted">({row.childNames.join("、")})</span> : null}
      </td>
      <td className="px-4 py-3">{row.shopifyOrderId ?? "—"}</td>
    </tr>
  );
}
