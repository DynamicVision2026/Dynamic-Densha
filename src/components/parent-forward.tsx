import type { ForwardMetrics } from "@/lib/parent-forward";
import type { GradeRoute } from "@/lib/grade-route";
import type { ProgressState } from "@/lib/progress-eval";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import type { ProjectedArrival } from "@/lib/projected-arrival";
import type { MessageKey } from "@/lib/i18n/messages";
import { GradeRouteStrip } from "@/components/grade-route-strip";
import { GradeHistoryList } from "@/components/grade-history";
import { useI18n } from "@/lib/i18n/i18n";

const MONTH_KEYS = [
  "month1",
  "month2",
  "month3",
  "month4",
  "month5",
  "month6",
  "month7",
  "month8",
  "month9",
  "month10",
  "month11",
  "month12",
] as const satisfies readonly MessageKey[];

export function ParentForwardView({
  forward,
  route,
  plan,
  progress,
  arrival,
  history,
}: {
  forward: ForwardMetrics;
  route: GradeRoute;
  plan: WeeklyPlan;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  arrival?: ProjectedArrival | null;
  history?: GradeRoute[];
}) {
  const { t } = useI18n();
  const month =
    arrival?.month && arrival.month >= 1 && arrival.month <= 12
      ? t(MONTH_KEYS[arrival.month - 1]!)
      : "";

  return (
    <>
      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-forward>
        <h2 className="font-display text-lg">{t("parentForward")}</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentStationsLeft")}</p>
            <p className="font-display text-xl tabular-nums">
              {forward.stationsRemaining}
              <span className="text-sm text-fg-subtle"> / {forward.routeTotal}</span>
            </p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentGreenCount")}</p>
            <p className="font-display text-xl tabular-nums">{forward.greenCount}</p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentRideDays")}</p>
            <p className="font-display text-xl tabular-nums">{forward.rideDays28}</p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentReturnRide")}</p>
            <p className="font-display text-xl tabular-nums">
              {forward.returnRidden}/{forward.returnDue}
            </p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentInspectQueue")}</p>
            <p className="font-display text-xl tabular-nums">{forward.inspectionDue}</p>
          </li>
        </ul>
        {arrival ? (
          <div className="mt-4 rounded-lg bg-bg px-3 py-3" data-projected-arrival={arrival.kind}>
            <p className="text-sm leading-6">
              {arrival.kind === "done"
                ? t("parentArrivalDone")
                : arrival.kind === "pace" && arrival.overHorizon
                  ? t("parentArrivalOverHorizon")
                  : arrival.kind === "pace"
                    ? t("parentArrivalPace", { month })
                    : t("parentArrivalUnknown")}
            </p>
            {arrival.kind === "pace" && arrival.overHorizon ? (
              <span className="sr-only" data-arrival-horizon="over" />
            ) : null}
            <p className="mt-2 text-xs text-fg-subtle">{t("parentArrivalDisclaimer")}</p>
            <p className="mt-1 text-xs text-fg-subtle">{t("parentArrivalOrderNote")}</p>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-fg-subtle">{t("parentNoBehind")}</p>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-week-ride>
        <h2 className="font-display text-lg">{t("parentWeekRide")}</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentWeekNewReached")}</p>
            <p className="font-display text-xl tabular-nums">
              {forward.weeklyNewReached}/{forward.weeklyNewPlanned}
            </p>
          </li>
          <li className="rounded-lg bg-bg px-3 py-3">
            <p className="text-[11px] text-fg-subtle">{t("parentWeekReturnRode")}</p>
            <p className="font-display text-xl tabular-nums">
              {forward.returnRidden}/{forward.returnDue}
            </p>
          </li>
        </ul>
      </section>

      <GradeRouteStrip route={route} plan={plan} progress={progress} />
      {history?.length ? <GradeHistoryList routes={history} progress={progress} /> : null}
    </>
  );
}
