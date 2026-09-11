import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOverview, getAdminStatus, type AdminHouseholdRow, type AdminWebhookEvent } from "@/lib/server/admin";
import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/app/admin")({
  component: AdminPage,
});

/**
 * The admin surface's own guard, separate from the /app layout's (which only
 * establishes that SOMEONE is signed in, and sends a signed-out visitor to
 * /login carrying this path so they come back here rather than to /app).
 *
 * A non-admin gets a 403 page, not a redirect. The redirect this replaced
 * sent them to /app, which funnels a childless account into the
 * register-a-child form -- so a failed admin check looked exactly like
 * "please register your child", which is how this whole class of confusion
 * started. Their session is untouched either way.
 *
 * Authorization is decided twice on purpose: getAdminStatus picks the view,
 * and getAdminOverview refuses to return a single household row to a
 * non-admin regardless of what the client asks for. The client check is
 * convenience; the server one is the gate.
 */
function AdminPage() {
  const { t, locale } = useI18n();
  const statusQ = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => getAdminStatus(),
    retry: false,
  });
  const isAdmin = statusQ.data?.isAdmin === true;

  const overviewQ = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
    enabled: isAdmin,
    retry: false,
  });

  if (statusQ.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  // Covers "signed in but not an admin" and a status probe that failed
  // outright; both mean we cannot show this page, and the 403 has a way back
  // so neither is a dead end.
  if (!isAdmin) return <Forbidden />;

  if (overviewQ.isLoading || !overviewQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const { summary, households, webhookEvents } = overviewQ.data;

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

        <h2 className="mt-10 font-display text-xl">{t("adminWebhookLog")}</h2>
        <p className="mt-1 text-xs text-fg-muted">{t("adminWebhookLogHint")}</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface" data-admin-webhooks>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-normal">{t("adminColReceived")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColEvent")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColParent")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColOrder")}</th>
                <th className="px-4 py-3 font-normal">{t("adminColPlan")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {webhookEvents.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-fg-muted" colSpan={5}>
                    {t("adminWebhookLogEmpty")}
                  </td>
                </tr>
              ) : (
                webhookEvents.map((e, i) => <WebhookRow key={`${e.receivedAt}-${i}`} event={e} locale={locale} />)
              )}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}

/** Shown to a signed-in non-admin. Never a redirect: bouncing to /app is what made a refused check look like "register your child". */
function Forbidden() {
  const { t } = useI18n();
  return (
    <AppShell>
      <main data-admin-forbidden className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="font-display text-5xl text-fg-subtle">403</p>
        <p className="mt-4 font-display text-xl">{t("adminForbiddenTitle")}</p>
        <p className="mt-2 text-sm leading-6 text-fg-muted">{t("adminForbiddenBody")}</p>
        <Link
          to="/app"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm text-primary-fg"
        >
          {t("backToApp")}
        </Link>
      </main>
    </AppShell>
  );
}

function WebhookRow({ event, locale }: { event: AdminWebhookEvent; locale: string }) {
  return (
    <tr data-admin-webhook-row>
      <td className="px-4 py-3 text-xs whitespace-nowrap">{formatChildTimestamp(event.receivedAt, locale)}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-bg-warm px-2 py-0.5 text-xs">{event.type}</span>
      </td>
      <td className="px-4 py-3 text-xs text-fg-muted">{event.ownerEmail ?? "—"}</td>
      <td className="px-4 py-3 text-xs">{event.orderName ?? event.shopifyOrderId ?? "—"}</td>
      <td className="px-4 py-3 text-xs">{event.plan ?? "—"}</td>
    </tr>
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

/** Time-of-day, not just a date -- what makes two rapid double-submits (seconds apart) visually obvious here. */
function formatChildTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
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
        {row.children.length ? (
          <ul className="mt-1 space-y-0.5">
            {row.children.map((child, i) => (
              <li key={`${child.name}-${i}`} className="text-xs text-fg-muted">
                {child.name}
                <span className="ml-1 text-fg-subtle">{formatChildTimestamp(child.createdAt, locale)}</span>
                {child.archived ? <span className="ml-1 text-fg-subtle">{t("adminChildArchived")}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </td>
      <td className="px-4 py-3">{row.shopifyOrderId ?? "—"}</td>
    </tr>
  );
}
