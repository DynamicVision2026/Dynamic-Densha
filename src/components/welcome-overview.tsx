import { useEffect, useMemo, useState } from "react";
import { familyRadials, hubCounts, type GradeRingView } from "@/lib/train-overview";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

const CAR_CAP = 8;

/** Far → near visual rows. Grade 6 recedes; grade 1 is the working field. */
const TERRACES: { grade: Grade; top: number; h: number }[] = [
  { grade: 6, top: 232, h: 38 },
  { grade: 5, top: 262, h: 42 },
  { grade: 4, top: 296, h: 46 },
  { grade: 3, top: 334, h: 50 },
  { grade: 2, top: 376, h: 56 },
  { grade: 1, top: 422, h: 96 },
];

function terraceFill(y: number, h: number, bulge: number) {
  const yb = y + h;
  return [
    `M -24 ${yb + 12}`,
    `L -24 ${y + 10}`,
    `C 48 ${y - bulge} 120 ${y + bulge + 8} 188 ${y - 2}`,
    `C 256 ${y - bulge - 6} 318 ${y + 12} 392 ${y + 6}`,
    `L 392 ${yb + 16}`,
    "Z",
  ].join(" ");
}

function furrow(y: number, i: number) {
  const yy = y + i * 7;
  return `M 8 ${yy} C 86 ${yy - 5} 168 ${yy + 7} 248 ${yy - 2} S 348 ${yy + 4} 368 ${yy}`;
}

function runLoop(top: number, h: number) {
  const y = top + h * 0.5;
  return [
    `M -70 ${y + 6}`,
    `C 40 ${y - 22} 130 ${y + 24} 220 ${y - 10}`,
    `C 290 ${y - 28} 350 ${y + 8} 430 ${y - 4}`,
  ].join(" ");
}

function Engine({ steam }: { steam?: boolean }) {
  return (
    <g data-engine>
      <rect x="-28" y="-18" width="54" height="30" rx="4" fill="var(--color-primary)" />
      <rect x="12" y="-30" width="10" height="14" rx="1.6" fill="var(--color-primary)" />
      <rect x="-22" y="-8" width="16" height="10" rx="1.4" fill="var(--color-primary-fg)" opacity="0.38" />
      <circle cx="-14" cy="14" r="5" fill="var(--color-fg)" />
      <circle cx="14" cy="14" r="5" fill="var(--color-fg)" />
      <circle cx="-14" cy="14" r="1.8" fill="var(--color-bg)" />
      <circle cx="14" cy="14" r="1.8" fill="var(--color-bg)" />
      {steam ? (
        <g className="welcome-steam" aria-hidden>
          <circle className="welcome-steam-puff" cx="20" cy="-34" r="6" fill="var(--color-fg)" />
          <circle className="welcome-steam-puff puff-2" cx="30" cy="-42" r="4.5" fill="var(--color-fg)" />
          <circle className="welcome-steam-puff puff-3" cx="14" cy="-46" r="3.6" fill="var(--color-fg)" />
        </g>
      ) : null}
    </g>
  );
}

function WoodCar({
  char,
  glow,
  focus,
}: {
  char: string;
  glow?: boolean;
  focus?: boolean;
}) {
  return (
    <g data-overview-car={char} className={cn(glow && "welcome-glow")}>
      <rect
        x="-22"
        y="-20"
        width="44"
        height="38"
        rx="3.2"
        fill="var(--color-bg-warm)"
        stroke="var(--color-fg)"
        strokeWidth={focus ? 1.6 : 0.9}
        opacity="0.98"
      />
      <rect x="-18" y="-16" width="36" height="7" rx="1.2" fill="var(--color-border)" opacity="0.75" />
      <text
        textAnchor="middle"
        y="12"
        fontSize="22"
        fontFamily="var(--font-display)"
        fill="var(--color-fg)"
      >
        {char}
      </text>
    </g>
  );
}

function Consist({
  grade,
  cars,
  idle,
  paused,
  path,
  glow,
  focusChar,
}: {
  grade: Grade;
  cars: string[];
  idle: boolean;
  paused: boolean;
  path: string;
  glow?: string[];
  focusChar?: string;
}) {
  const shown = cars.slice(Math.max(0, cars.length - CAR_CAP));
  return (
    <g
      className={cn("welcome-run", idle && "is-idle", paused && "is-paused")}
      style={{ offsetPath: `path("${path}")` }}
      data-orbit
      data-consist={grade}
      data-idle={idle || undefined}
      data-overview-cars={cars.length}
    >
      <Engine steam />
      {shown.map((char, i) => (
        <g key={char} transform={`translate(${-46 - i * 46} 0)`}>
          <rect x="18" y="-2" width="8" height="3" fill="var(--color-fg)" opacity="0.4" />
          <WoodCar char={char} glow={Boolean(glow?.includes(char))} focus={char === focusChar} />
        </g>
      ))}
    </g>
  );
}

export function WelcomeOverview({
  rings,
  profileGrade,
  focusGrade,
  focusChar,
  glow,
  hrefBase,
  onBack,
  onFocusGrade,
}: {
  rings: GradeRingView[];
  profileGrade: Grade;
  focusGrade: Grade;
  focusChar?: string;
  glow?: string[];
  hrefBase: "/demo" | "/app";
  onBack: () => void;
  onFocusGrade: (g: Grade) => void;
}) {
  const { t } = useI18n();
  const [linesOn, setLinesOn] = useState(false);
  const [glowOn, setGlowOn] = useState(Boolean(glow?.length));
  const focused = rings.find((r) => r.grade === focusGrade) ?? rings.find((r) => r.grade === profileGrade);
  const radials = useMemo(() => (linesOn ? familyRadials(rings) : []), [linesOn, rings]);
  const complete = Boolean(focused?.complete);
  const paused = glowOn || complete;
  const hub = hubCounts(rings, focusGrade);
  const nearRow = TERRACES.find((row) => row.grade === (focused?.grade ?? profileGrade)) ?? TERRACES[5]!;

  useEffect(() => {
    if (!glow?.length) return;
    setGlowOn(true);
    const id = window.setTimeout(() => setGlowOn(false), 1100);
    return () => window.clearTimeout(id);
  }, [glow]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-welcome-overview
      data-welcome-hero
      data-focus-grade={focusGrade}
      data-complete={complete || undefined}
      data-href-base={hrefBase}
      data-green-count={hub.green}
    >
      <button
        type="button"
        data-green-sign
        onClick={() => onFocusGrade(focusGrade)}
        className="absolute left-3 top-[max(0.6rem,env(safe-area-inset-top))] z-[2] min-h-11 rounded-md border border-border bg-surface/90 px-3 py-2 text-left shadow-soft"
        aria-label={`${t("greenCars")} ${t("greenCarsCount", { n: hub.green })}`}
      >
        <span className="block text-[11px] tracking-wide text-fg-subtle">{t("greenCars")}</span>
        <span className="font-display text-2xl tabular-nums leading-none">{t("greenCarsCount", { n: hub.green })}</span>
      </button>

      <section className="relative min-h-0 flex-1 overflow-hidden">
        <svg
          viewBox="0 0 360 640"
          preserveAspectRatio="xMidYMax slice"
          className="h-full w-full"
          role="img"
          aria-label={t("greenCars")}
          data-hero-plate
        >
          <rect width="360" height="640" fill="var(--color-bg)" />
          <path d="M -10 210 C 70 150 120 188 180 120 C 230 70 280 96 380 40 L 380 260 L -10 280 Z" fill="var(--color-fg)" opacity="0.07" />
          <path d="M -20 188 C 40 140 90 168 150 108 C 210 52 270 88 400 36 L 400 230 L -20 250 Z" fill="var(--color-fg)" opacity="0.11" />
          <path d="M 40 200 C 110 120 160 156 220 96 C 270 50 320 78 390 44 L 390 220 L 20 236 Z" fill="var(--color-fg)" opacity="0.16" />
          <ellipse cx="120" cy="168" rx="90" ry="18" fill="var(--color-bg)" opacity="0.45" />
          <ellipse cx="240" cy="132" rx="110" ry="22" fill="var(--color-bg)" opacity="0.35" />

          {TERRACES.map((row, idx) => {
            const ring = rings.find((r) => r.grade === row.grade);
            const open = Boolean(ring?.open);
            const active = row.grade === focusGrade;
            const bulge = 6 + idx;
            return (
              <g
                key={row.grade}
                data-terrace={row.grade}
                data-terrace-open={open || undefined}
                className="cursor-pointer"
                onClick={() => {
                  if (open) onFocusGrade(row.grade);
                }}
              >
                <path
                  d={terraceFill(row.top, row.h, bulge)}
                  fill={open ? "var(--color-bg-warm)" : "var(--color-bg)"}
                  stroke="var(--color-fg)"
                  strokeWidth={active ? 1.1 : 0.55}
                  opacity={open ? (active ? 0.95 : 0.72) : 0.38}
                />
                {open
                  ? [0, 1, 2, 3].map((i) => (
                      <path
                        key={i}
                        d={furrow(row.top + 14, i)}
                        fill="none"
                        stroke="var(--color-fg)"
                        strokeWidth="0.45"
                        opacity={active ? 0.18 : 0.08}
                      />
                    ))
                  : null}
              </g>
            );
          })}

          <g opacity="0.92" aria-hidden>
            <path d="M 292 430 L 318 352 L 344 430 Z" fill="var(--color-status-perfect)" />
            <path d="M 300 400 L 318 368 L 336 400 Z" fill="var(--color-status-perfect)" opacity="0.85" />
            <rect x="315" y="428" width="6" height="22" fill="var(--color-fg)" opacity="0.7" />
          </g>
          <rect x="328" y="72" width="18" height="18" fill="var(--color-primary)" opacity="0.92" />
          <path
            d={runLoop(nearRow.top, nearRow.h)}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="1.4"
            opacity="0.22"
            data-run-rail
          />

          {radials.map((line) => (
            <polyline
              key={line.id}
              fill="none"
              stroke="var(--color-fg)"
              strokeWidth="0.8"
              opacity="0.28"
              points={line.points
                .map((p) => {
                  const row = TERRACES.find((t) => t.grade === p.grade);
                  if (!row) return null;
                  const x = 36 + (p.index / Math.max(p.total, 1)) * 280;
                  const y = row.top + row.h * 0.45;
                  return `${x},${y}`;
                })
                .filter(Boolean)
                .join(" ")}
            />
          ))}

          {rings
            .filter((ring) => ring.open)
            .map((ring) => {
              const row = TERRACES.find((t) => t.grade === ring.grade);
              if (!row) return null;
              const isNear = ring.grade === (focused?.grade ?? profileGrade);
              const cars = ring.consist;
              if (!isNear && cars.length === 0) return null;
              const idle = isNear && cars.length === 0;
              return (
                <Consist
                  key={ring.grade}
                  grade={ring.grade}
                  cars={cars}
                  idle={idle}
                  paused={paused && isNear}
                  path={runLoop(row.top, row.h)}
                  glow={isNear ? glow : undefined}
                  focusChar={isNear ? focusChar : undefined}
                />
              );
            })}
        </svg>
      </section>

      <button
        type="button"
        data-overview-back
        onClick={onBack}
        className="absolute bottom-[max(0.9rem,env(safe-area-inset-bottom))] left-3 z-[2] inline-flex h-11 min-w-11 items-center rounded-md border border-border bg-surface/90 px-3 text-sm text-fg-muted shadow-soft"
      >
        {t("overviewBack")}
      </button>
      <button
        type="button"
        data-toggle-lines
        onClick={() => setLinesOn((v) => !v)}
        className="absolute bottom-[max(0.9rem,env(safe-area-inset-bottom))] right-3 z-[2] inline-flex h-11 items-center rounded-md border border-border bg-surface/90 px-3 text-xs text-fg-subtle shadow-soft"
      >
        {linesOn ? t("hideLines") : t("seeLines")}
      </button>
    </div>
  );
}
