import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAutoDemo } from "@/components/auto-demo";
import { ChildShell } from "@/components/child-shell";
import { HomeLineStrip } from "@/components/home-line-strip";
import { HubPlate } from "@/components/hub-plate";
import { MapOverlay } from "@/components/map-overlay";
import { ParentDoor } from "@/components/parent-door";
import { WelcomeOverview } from "@/components/welcome-overview";
import type { MapLineView } from "@/components/route-map";
import { STATUS_META } from "@/lib/mastery";
import type { DepartureBoard } from "@/lib/departure-board";
import {
  boardStageCards,
  pickDeparture,
  type StageCard,
  type StripCar,
} from "@/lib/pick-departure";
import {
  clearOverviewGlow,
  clearOverviewOpen,
  hubCounts,
  readOverviewIntent,
  type GradeRingView,
} from "@/lib/train-overview";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

export function ChildHome({
  hrefBase,
  childId,
  grade,
  profileGrade,
  cars,
  board,
  echoQueue,
  lines,
  rings,
}: {
  hrefBase: "/demo" | "/app";
  childId?: string;
  grade: Grade;
  profileGrade: Grade;
  cars: StripCar[];
  board: DepartureBoard | null | undefined;
  echoQueue: { kanji: string }[];
  lines: MapLineView[];
  rings: GradeRingView[];
}) {
  const { t } = useI18n();
  const tour = useAutoDemo();
  const [mapOpen, setMapOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const [focusGrade, setFocusGrade] = useState<Grade>(grade);
  const [focusChar, setFocusChar] = useState<string | undefined>();
  const [glow, setGlow] = useState<string[]>([]);
  const cards = useMemo(
    () => boardStageCards({ board, echoQueue, cars }),
    [board, echoQueue, cars],
  );
  const depart = useMemo(
    () => pickDeparture({ board, echoQueue, cars }),
    [board, echoQueue, cars],
  );
  const rideTo = hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char";
  const parentTo = hrefBase === "/demo" ? "/demo/parent" : "/app/parent";
  const search = {
    ...(childId ? { child: childId } : {}),
    grade,
  };
  const hub = hubCounts(rings, grade);

  useEffect(() => {
    const intent = readOverviewIntent();
    if (!intent) return;
    if (intent.open) {
      setOverview(true);
      if (intent.focusChar) setFocusChar(intent.focusChar);
      clearOverviewOpen();
    }
    if (intent.glow?.length) {
      setGlow(intent.glow);
      window.setTimeout(() => {
        setGlow([]);
        setFocusChar(undefined);
        clearOverviewGlow();
      }, 1200);
    }
  }, []);

  function openOverview(opts?: { char?: string }) {
    setMapOpen(false);
    setFocusGrade(grade);
    setFocusChar(opts?.char);
    setOverview(true);
  }

  const kindLabel = (kind: StageCard["kind"]) =>
    kind === "return" ? t("boardReturn") : kind === "new" ? t("boardNew") : t("boardInspect");

  return (
    <ChildShell>
      {tour.active ? (
        <p className="shrink-0 bg-bg-warm px-4 py-1 text-center text-[11px] text-fg-muted">
          {t("tourLiveBanner")}
        </p>
      ) : null}

      {overview ? (
        <WelcomeOverview
          rings={rings}
          profileGrade={profileGrade}
          focusGrade={focusGrade}
          focusChar={focusChar}
          glow={glow}
          hrefBase={hrefBase}
          onBack={() => {
            setOverview(false);
            setFocusChar(undefined);
          }}
          onFocusGrade={(g) => {
            setFocusGrade(g);
            setFocusChar(undefined);
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" {...(mapOpen ? { inert: true } : {})}>
          <header
            data-child-top
            className="flex h-[88px] shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]"
          >
            <HubPlate
              green={hub.green}
              ridden={hub.ridden}
              total={rings.find((r) => r.grade === grade)?.total ?? 80}
              onOpen={() => openOverview()}
            />
            <HomeLineStrip
              cars={cars}
              currentChar={depart.kanji}
              hrefBase={hrefBase}
              childId={childId}
              grade={grade}
              onOpenMap={() => setMapOpen(true)}
            />
            <ParentDoor to={parentTo} />
          </header>

          <section
            data-child-stage
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          >
            {depart.empty ? (
              <div
                className="rounded-lg border border-border bg-surface px-4 py-6 text-center"
                data-empty-board
              >
                <p className="text-sm leading-7 text-fg-muted">{t("emptyBoard")}</p>
                {board?.tomorrow[0] ? (
                  <p className="mt-2 text-xs text-fg-subtle">
                    {t("echoArrival", {
                      when:
                        board.tomorrow[0].when === "dayAfter"
                          ? t("echoArrivalDayAfter")
                          : t("echoArrivalTomorrow"),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 landscape:grid-cols-2">
              {cards.map((card) => (
                <Link
                  key={`${card.kind}-${card.kanji}`}
                  to={rideTo}
                  params={{ char: card.kanji }}
                  search={search}
                  data-board-car={card.kanji}
                  data-tour={card.kind === "return" ? `echo-${card.kanji}` : undefined}
                  className="flex min-h-[88px] items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span
                    className={cn(
                      "grid size-14 place-items-center rounded-md font-display text-3xl",
                      STATUS_META[card.status].className,
                    )}
                  >
                    {card.kanji}
                  </span>
                  <span className="text-sm text-fg-muted">{kindLabel(card.kind)}</span>
                </Link>
              ))}
            </div>
          </section>

          <footer
            data-child-action
            className="flex h-[160px] shrink-0 items-center justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] landscape:h-[120px] max-sm:h-[132px]"
          >
            <Link
              to={rideTo}
              params={{ char: depart.kanji }}
              search={search}
              data-depart
              data-free-ride={depart.empty || undefined}
              className="inline-flex h-[88px] min-w-[88px] w-full max-w-md items-center justify-center rounded-xl bg-primary px-8 font-display text-2xl tracking-wide text-primary-fg landscape:w-[40%]"
            >
              {depart.empty ? t("freeRide") : t("depart")}
            </Link>
          </footer>
        </div>
      )}

      <MapOverlay
        open={mapOpen}
        lines={lines}
        hrefBase={hrefBase}
        childId={childId}
        grade={grade}
        onClose={() => setMapOpen(false)}
      />
    </ChildShell>
  );
}

