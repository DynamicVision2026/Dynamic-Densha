import { StatusLegend } from "@/components/status-legend";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import { STATUS_KEYS } from "@/lib/i18n/messages";
import { echoArrivalWhen } from "@/lib/echo-arrival";
import { useI18n } from "@/lib/i18n/i18n";
import type { ParentReport } from "@/lib/parent-report";

const STATUS_BAR: MasteryStatus[] = ["new", "lost", "fix", "almost", "perfect"];

export function ParentReportView({
  report,
}: {
  report: ParentReport;
  homeTo?: "/demo" | "/app";
}) {
  const { t } = useI18n();
  const total = Math.max(1, report.timetableTotal);

  return (
    <>
      <p className="mt-2 text-sm text-fg-muted">{t("parentCharVsWord")}</p>
      <p className="mt-2 text-sm leading-7 text-fg">{t("parentRolesApp")}</p>
      <p className="text-sm leading-7 text-fg-muted">{t("parentRolesPaper")}</p>

      <section className="mt-6 rounded-xl border border-border bg-surface p-5" data-parent-progress>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg">{t("grade")}</h2>
          <p className="text-xs text-fg-subtle">
            {t("parentTeachReady", { n: report.teachReadyPerfect, total: report.teachReadyTotal })}
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{t("parentTeachReadyNote")}</p>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-bg">
          {STATUS_BAR.map((k) => {
            const n = report.counts[k];
            if (!n) return null;
            return (
              <span
                key={k}
                className={STATUS_META[k].className}
                style={{ width: `${(n / total) * 100}%` }}
                title={`${t(STATUS_KEYS[k])} ${n}`}
              />
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STATUS_BAR.map((k) => (
            <div key={k} className="rounded-lg bg-bg px-3 py-3 text-center">
              <p className="text-[11px] text-fg-subtle">{t(STATUS_KEYS[k])}</p>
              <p className="font-display text-2xl tabular-nums">{report.counts[k]}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <StatusLegend compact />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-week>
        <h2 className="font-display text-lg">{t("parentWeek")}</h2>
        <p className="mt-2 text-sm leading-7 text-fg">
          {t("parentSummary", { echo: report.summary.echo, fix: report.summary.fix })}
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentWeekSessions")}</p>
            <p className="font-display text-xl tabular-nums">
              {report.week.sessionsCompleted}/{report.week.sessionsStarted}
            </p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentWeekEchoes")}</p>
            <p className="font-display text-xl tabular-nums">{report.week.echoesCompleted}</p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3 col-span-2 sm:col-span-2">
            <p className="text-[11px] text-fg-subtle">{t("parentWeekNew")}</p>
            <p className="font-display text-xl tabular-nums">{report.week.newAlmostOrPerfect}</p>
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-week-taught>
        <h2 className="font-display text-lg">{t("parentTaughtTitle")}</h2>
        {report.taught.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{t("parentTaughtEmpty")}</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-border">
              {report.taught.map((row) => (
                <li key={row.kanji} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-display text-2xl">{row.kanji}</span>
                    {row.word ? (
                      <span className="ml-2 text-sm text-fg-muted">{row.word}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {row.structure
                      ? row.structure
                      : row.familyLabel
                        ? row.familyLabel
                        : row.lineLabel
                          ? row.lineLabel
                          : t(row.kind === "reading" ? "kindReading" : row.kind === "meaning" ? "kindMeaning" : "kindShape")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-fg-subtle">{t("parentTaughtHonesty")}</p>
          </>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-attention>
        <h2 className="font-display text-lg">{t("parentAttention")}</h2>
        {report.attention.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{t("parentAttentionEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {report.attention.map((row) => {
              const when =
                row.status === "almost" && row.echoDueAt
                  ? echoArrivalWhen(row.echoDueAt, new Date().toISOString(), t)
                  : null;
              return (
              <li key={row.kanji} className="flex items-baseline justify-between gap-3 py-2.5">
                <span>
                  <span className="font-display text-2xl">{row.kanji}</span>
                  {row.word && row.word !== row.kanji ? (
                    <span className="ml-2 text-sm text-fg-muted">{row.word}</span>
                  ) : null}
                </span>
                <span className="text-xs text-fg-subtle" data-echo-arrival={when ? row.kanji : undefined}>
                  {row.reason === "waiting_second"
                    ? when
                      ? `${t("parentAttentionWaiting")} · ${when}`
                      : t("parentAttentionWaiting")
                    : when
                      ? `${t(STATUS_KEYS[row.status])} · ${when}`
                      : t(STATUS_KEYS[row.status])}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-paper>
        <h2 className="font-display text-lg">{t("parentPaper")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("parentPaperLead")}</p>
        {report.paper.length === 0 ? (
          <p className="mt-3 text-sm text-fg-subtle">{t("parentAttentionEmpty")}</p>
        ) : (
          <ol className="mt-4 flex flex-wrap gap-3">
            {report.paper.map((ch) => (
              <li
                key={ch}
                className="grid size-14 place-items-center rounded-md border border-border bg-bg font-display text-2xl"
              >
                {ch}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-xs leading-relaxed text-fg-subtle">{t("parentPaperDisclaimer")}</p>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg">{t("parentStamps")}</h2>
          <p className="font-display text-xl tabular-nums">{t("stampsCount", { n: report.stampCount })}</p>
        </div>
        <p className="mt-2 text-sm text-fg-muted">{t("stampsLead")}</p>
        <h3 className="mt-5 font-display text-base">{t("parentLineProgress")}</h3>
        <ul className="mt-3 space-y-2">
          {report.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between text-sm">
              <span className="font-display">{line.label}</span>
              <span className="tabular-nums text-fg-muted">
                {t("lineStationsTouched", { touched: line.touched, perfect: line.perfect, total: line.total })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
