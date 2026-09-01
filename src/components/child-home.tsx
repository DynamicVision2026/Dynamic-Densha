import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAutoDemo } from "@/components/auto-demo";
import { ChildShell } from "@/components/child-shell";
import { DepartureTicket } from "@/components/departure-ticket";
import { HomeLineStrip } from "@/components/home-line-strip";
import { HubPlate } from "@/components/hub-plate";
import { MapOverlay } from "@/components/map-overlay";
import { ParentDoor } from "@/components/parent-door";
import { WelcomeOverview } from "@/components/welcome-overview";
import type { MapLineView } from "@/components/route-map";
import type { DepartureBoard } from "@/lib/departure-board";
import {
  boardStageCards,
  pickDeparture,
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
  const navigate = useNavigate();
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

  const catalogTo = hrefBase === "/demo" ? "/demo/catalog" : "/app/catalog";
  const nextLabel =
    board?.today.find((c) => c.label)?.label ??
    board?.tomorrow[0]?.label ??
    null;
  const echoDue = cards.some((c) => c.echoDue);
  const glyphs = cards.map((c) => c.kanji);

  function rideFromTicket() {
    if (depart.empty) {
      void navigate({ to: catalogTo, search: { grade } });
      return;
    }
    void navigate({
      to: rideTo,
      params: { char: depart.kanji },
      search,
    });
  }

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
            className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain px-4 py-3"
          >
            <DepartureTicket
              glyphs={glyphs}
              empty={depart.empty}
              nextArrivalLabel={nextLabel}
              echoDue={echoDue}
              onRide={rideFromTicket}
              ariaName={t("ticketAria")}
              stationLabel={t("ticketStation")}
              rideLabel={depart.empty ? t("freeRide") : t("ticketRide")}
              emptyLead={t("ticketEmpty")}
              countLabel={t("ticketCount", { n: glyphs.length })}
            />
          </section>
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

