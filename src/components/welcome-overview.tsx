import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { familyRadials, hubCounts, type GradeRingView } from "@/lib/train-overview";
import {
  CAR_CAP,
  CAR_GAP,
  FIRST_CLIMB_D,
  SWITCHBACK_PATH,
  TRAIN_SPEED,
  firstClimbDistance,
  openingHead,
  poseAt,
  sampleLut,
  wrapHead,
  type CarPose,
} from "@/lib/welcome-switchback";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Engine({ steam }: { steam?: boolean }) {
  return (
    <g data-engine>
      <rect x="-26" y="-45" width="52" height="45" rx="8" fill="var(--color-primary)" stroke="var(--color-primary)" strokeWidth="1.2" />
      <rect x="4" y="-59" width="12" height="14" rx="2" fill="var(--color-primary)" />
      <circle cx="-14" cy="-22" r="6" fill="var(--color-bg-warm)" />
      <circle cx="-12" cy="1" r="4" fill="var(--color-fg)" opacity="0.78" />
      <circle cx="12" cy="1" r="4" fill="var(--color-fg)" opacity="0.78" />
      {steam ? (
        <g className="welcome-steam" aria-hidden>
          <circle className="welcome-steam-puff" cx="14" cy="-64" r="5" fill="var(--color-fg)" />
          <circle className="welcome-steam-puff puff-2" cx="22" cy="-72" r="3.6" fill="var(--color-fg)" />
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
        x="-26"
        y="-45"
        width="52"
        height="45"
        rx="8"
        fill="var(--color-bg-warm)"
        stroke="var(--color-fg)"
        strokeWidth={focus ? 1.6 : 1.1}
      />
      <rect x="-20" y="-40" width="40" height="7" rx="1.4" fill="var(--color-border)" opacity="0.8" />
      <circle cx="-12" cy="1" r="4" fill="var(--color-fg)" opacity="0.72" />
      <circle cx="12" cy="1" r="4" fill="var(--color-fg)" opacity="0.72" />
      <text
        textAnchor="middle"
        y="-18"
        fontSize="28"
        fontFamily="var(--font-display)"
        fill="var(--color-fg)"
      >
        {char}
      </text>
    </g>
  );
}

function posed(pose: CarPose) {
  if (pose.hidden) return { opacity: "0", transform: `translate(${pose.x} ${pose.y})` };
  return {
    opacity: String(pose.opacity),
    transform: `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) scale(${pose.scale.toFixed(3)})`,
  };
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
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const focused = rings.find((r) => r.grade === focusGrade) ?? rings.find((r) => r.grade === profileGrade);
  const radials = useMemo(() => (linesOn ? familyRadials(rings) : []), [linesOn, rings]);
  const complete = Boolean(focused?.complete);
  const hub = hubCounts(rings, focusGrade);
  const consist = (focused?.consist ?? []).slice(Math.max(0, (focused?.consist.length ?? 0) - CAR_CAP));
  const idle = consist.length === 0;
  const paused = glowOn || reduced || idle;

  const pathRef = useRef<SVGPathElement>(null);
  const [lut, setLut] = useState<[number, number][]>([]);
  const [length, setLength] = useState(0);
  const [head, setHead] = useState(0);
  const headRef = useRef(0);
  const climbRef = useRef(FIRST_CLIMB_D);

  useLayoutEffect(() => {
    const node = pathRef.current;
    if (!node) return;
    const L = node.getTotalLength();
    const sampled = sampleLut((d) => node.getPointAtLength(d), L);
    const climb = firstClimbDistance(sampled);
    setLut(sampled);
    setLength(L);
    climbRef.current = climb;
    const start = openingHead(consist.length, L, climb);
    headRef.current = start;
    setHead(start);
  }, [consist.length]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!glow?.length) return;
    setGlowOn(true);
    const id = window.setTimeout(() => setGlowOn(false), 1100);
    return () => window.clearTimeout(id);
  }, [glow]);

  useEffect(() => {
    if (paused || length <= 0) return;
    let last = performance.now();
    let raf = 0;
    const units = consist.length + 1;
    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      const next = wrapHead(headRef.current + TRAIN_SPEED * dt, units, length, climbRef.current);
      headRef.current = next;
      setHead(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [paused, length, consist.length]);

  const enginePose = poseAt(head, lut, length);
  const carPoses = consist.map((_, i) => poseAt(head - (i + 1) * CAR_GAP, lut, length));

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-welcome-overview
      data-welcome-hero
      data-switchback
      data-focus-grade={focusGrade}
      data-complete={complete || undefined}
      data-href-base={hrefBase}
      data-green-count={hub.green}
      data-idle={idle || undefined}
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
          viewBox="-20 0 410 530"
          preserveAspectRatio="xMidYMax meet"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={t("greenCars")}
          data-hero-plate
        >
          <rect x="-20" y="0" width="410" height="530" fill="var(--color-bg)" />
          <path d="M-20 150 L62 84 L108 122 L158 62 L214 118 L268 76 L330 128 L390 108 L390 200 L-20 200 Z" fill="var(--color-fg)" opacity="0.14" />
          <path d="M-20 172 L54 128 L120 166 L190 120 L252 164 L318 132 L390 158 L390 220 L-20 220 Z" fill="var(--color-fg)" opacity="0.08" />
          <rect x="-30" y="168" width="440" height="14" rx="7" fill="var(--color-bg)" opacity="0.8" />

          {(
            [
              [198, 0.22],
              [248, 0.18],
              [298, 0.14],
              [356, 0.1],
              [424, 0.07],
            ] as const
          ).map(([y, ink], i) => {
            const grade = (5 - i) as Grade;
            const open = Boolean(rings.find((r) => r.grade === grade)?.open);
            return (
              <path
                key={grade}
                data-terrace={grade}
                data-terrace-open={open || undefined}
                d={`M-20 ${y} Q90 ${y - 13} 185 ${y} T390 ${y} L390 530 L-20 530 Z`}
                fill="var(--color-bg-warm)"
                opacity={open ? 0.55 + ink : 0.28}
                onClick={() => {
                  if (open) onFocusGrade(grade);
                }}
              />
            );
          })}

          {[
            [38, 302],
            [92, 358],
            [302, 308],
            [262, 424],
            [62, 428],
            [326, 366],
            [150, 198],
            [236, 252],
          ].map(([x, y]) => {
            const s = y > 340 ? 11 : y > 280 ? 9 : 7;
            return (
              <path
                key={`${x}-${y}`}
                d={`M${x} ${y} l${s} ${s * 1.9} h${-s * 2} Z`}
                fill="var(--color-status-perfect)"
                opacity="0.85"
              />
            );
          })}
          <rect x="196" y="354" width="56" height="5" fill="var(--color-border-strong)" />
          <rect x="348" y="28" width="16" height="16" fill="var(--color-primary)" opacity="0.92" />

          <path
            d={SWITCHBACK_PATH}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="8"
            strokeDasharray="2 9"
            opacity="0.28"
          />
          <path
            ref={pathRef}
            d={SWITCHBACK_PATH}
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth="5"
            strokeLinecap="round"
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
                .map((p, i) => `${40 + i * 40},${420 - p.grade * 36}`)
                .join(" ")}
            />
          ))}

          <g
            data-orbit
            data-consist={focusGrade}
            data-overview-cars={consist.length}
            data-idle={idle || undefined}
            data-head={head.toFixed(0)}
          >
            <g {...posed(enginePose)} data-engine-y={enginePose.y.toFixed(0)}>
              <Engine steam />
            </g>
            {consist.map((char, i) => (
              <g
                key={char}
                data-car-scale={carPoses[i]?.scale.toFixed(3)}
                data-car-y={carPoses[i]?.y.toFixed(0)}
                {...posed(carPoses[i] ?? { x: 0, y: 0, scale: 1, opacity: 0, hidden: true })}
              >
                <WoodCar char={char} glow={glowOn && glow?.includes(char)} focus={char === focusChar} />
              </g>
            ))}
          </g>
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
