import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import { STATUS_KEYS } from "@/lib/i18n/messages";
import { writeStoredActiveGrade } from "@/lib/active-grade";
import { parseGrade } from "@/lib/grade-nav";
import { echoArrivalWhen } from "@/lib/echo-arrival";
import { useI18n } from "@/lib/i18n/i18n";
import type { LineType } from "@/data/lines";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

export type MapStationView = {
  kanji: string;
  grade: number;
  unopened: boolean;
  status: MasteryStatus;
  echoDue?: boolean;
  echoDueAt?: string | null;
};

export type MapLineView = {
  line: { id: string; type: LineType; label_ja: string; why: string };
  stations: MapStationView[];
};

function StationNode({
  station,
  hrefBase,
  childId,
  mode,
}: {
  station: MapStationView;
  hrefBase: "/demo" | "/app";
  childId?: string;
  mode?: "play" | "look";
  activeGrade?: Grade;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[station.status];
  const inLens = !station.unopened;
  const stationGrade = parseGrade(station.grade);
  const now = new Date().toISOString();
  const arrival =
    inLens && station.status === "almost" && station.echoDueAt
      ? echoArrivalWhen(station.echoDueAt, now, t)
      : null;
  const inner = (
    <span
      className={cn(
        "relative grid size-14 place-items-center rounded-full font-display text-2xl leading-none",
        !inLens && "border border-dashed border-border-strong bg-surface text-fg-subtle",
        inLens && meta.className,
      )}
    >
      {station.kanji}
      {station.echoDue && inLens ? (
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-engine" aria-hidden />
      ) : null}
    </span>
  );

  const search = {
    ...(childId ? { child: childId } : {}),
    mode: mode ?? "play",
    ...(stationGrade ? { grade: stationGrade } : {}),
  };

  return (
    <li className={cn("flex min-w-14 flex-col items-center gap-1", !inLens && "opacity-55")}>
      <Link
        to={hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char"}
        params={{ char: station.kanji }}
        search={search}
        onClick={() => {
          if (stationGrade) writeStoredActiveGrade(stationGrade, childId);
        }}
        aria-label={`${station.kanji} ${inLens ? t(STATUS_KEYS[station.status]) : t("gradeN", { n: station.grade })}`}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
      <span className="text-xs text-fg-subtle">
        {inLens ? t(STATUS_KEYS[station.status]) : t("gradeN", { n: station.grade })}
      </span>
      {arrival ? (
        <span className="text-[10px] leading-none text-fg-subtle" data-echo-arrival={station.kanji}>
          {arrival}
        </span>
      ) : null}
    </li>
  );
}

function Connector({ phonetic }: { phonetic: boolean }) {
  return (
    <li aria-hidden className="mb-6 min-w-6 flex-1 self-center px-1">
      <span
        className={cn(
          "block w-full",
          phonetic ? "h-px border-t border-dashed border-fg-subtle" : "h-0.5 bg-fg",
        )}
      />
    </li>
  );
}

function LineRow({
  view,
  hrefBase,
  childId,
  mode,
  activeGrade,
  focused,
}: {
  view: MapLineView;
  hrefBase: "/demo" | "/app";
  childId?: string;
  mode?: "play" | "look";
  activeGrade?: Grade;
  focused?: boolean;
}) {
  const { t } = useI18n();
  const phonetic = view.line.type === "phonetic";
  const scroller = useRef<HTMLOListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof sessionStorage === "undefined") return;
    const key = `densha.map.scroll.${view.line.id}`;
    const saved = Number(sessionStorage.getItem(key) ?? 0);
    if (saved) el.scrollLeft = saved;
    const onScroll = () => {
      try {
        sessionStorage.setItem(key, String(el.scrollLeft));
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [view.line.id]);

  useEffect(() => {
    if (!focused) return;
    sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [focused]);

  return (
    <section
      ref={sectionRef}
      data-tour={`line-${view.line.id}`}
      data-line-id={view.line.id}
      data-line-focus={focused ? "true" : undefined}
      className={cn(
        "rounded-lg border bg-surface px-4 py-4 shadow-soft",
        focused ? "border-engine ring-2 ring-engine/40" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">{view.line.label_ja}</h2>
        <p
          className={cn(
            "text-xs text-fg-subtle",
            phonetic ? "tracking-[0.22em]" : "font-display",
          )}
        >
          {phonetic ? t("linePhonetic") : t("lineSemantic")}
        </p>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{view.line.why}</p>
      <ol ref={scroller} className="mt-4 flex items-end overflow-x-auto pb-1">
        {view.stations.map((station, i) => (
          <span key={station.kanji} className="flex flex-1 items-end">
            {i > 0 ? <Connector phonetic={phonetic} /> : null}
            <StationNode
              station={station}
              hrefBase={hrefBase}
              childId={childId}
              mode={mode}
              activeGrade={activeGrade}
            />
          </span>
        ))}
      </ol>
    </section>
  );
}

export function RouteMap({
  lines,
  hrefBase,
  childId,
  mode,
  activeGrade,
  focusLineId,
}: {
  lines: MapLineView[];
  hrefBase: "/demo" | "/app";
  childId?: string;
  mode?: "play" | "look";
  activeGrade?: Grade;
  focusLineId?: string;
}) {
  const { t } = useI18n();
  const inLens = lines.some((view) => view.stations.some((s) => !s.unopened));
  if (lines.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-5 py-10 text-center text-sm text-fg-muted">
        {t("mapEmpty")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {!inLens ? (
        <p className="text-sm text-fg-muted">{t("mapNoGradeStations")}</p>
      ) : null}
      {lines.map((view) => (
        <LineRow
          key={view.line.id}
          view={view}
          hrefBase={hrefBase}
          childId={childId}
          mode={mode}
          activeGrade={activeGrade}
          focused={Boolean(focusLineId) && view.line.id === focusLineId}
        />
      ))}
    </div>
  );
}
