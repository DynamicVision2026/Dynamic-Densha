import { useEffect, useMemo, useState } from "react";
import { familyRadials, type GradeRingView } from "@/lib/train-overview";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const RING_R = [30, 42, 54, 66, 78, 90];
const CAR_CAP = 16;
const TICKS = 12;

function polar(r: number, t: number) {
  return { x: CX + r * Math.cos(t), y: CY + r * Math.sin(t) };
}

function arcPath(r: number, frac: number) {
  const start = -Math.PI / 2;
  const span = Math.max(0.001, Math.min(0.999, frac)) * Math.PI * 2;
  const a = polar(r, start);
  const b = polar(r, start + span);
  const large = frac > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

function consistAngles(n: number, r: number, frac: number) {
  const angEach = (8.4 + 1.6) / Math.max(r, 24);
  const packed = Math.max(n, 1) * angEach;
  const filled = Math.max(0.08, frac) * Math.PI * 2;
  const head = -Math.PI / 2 + Math.min(Math.PI * 1.85, Math.max(packed, filled));
  return Array.from({ length: n }, (_, i) => head - (n - 1 - i) * angEach);
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

  useEffect(() => {
    if (!glow?.length) return;
    setGlowOn(true);
    const id = window.setTimeout(() => setGlowOn(false), 1100);
    return () => window.clearTimeout(id);
  }, [glow]);

  const consist = focused?.consist ?? [];
  const shown = consist.slice(Math.max(0, consist.length - CAR_CAP));
  const angles = consistAngles(
    shown.length,
    RING_R[(focused?.grade ?? 1) - 1] ?? 54,
    focused?.total ? focused.perfect / focused.total : 0,
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-welcome-overview
      data-focus-grade={focusGrade}
      data-complete={complete || undefined}
      data-href-base={hrefBase}
    >
      <header className="flex h-[88px] shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          data-overview-back
          onClick={onBack}
          className="inline-flex h-11 min-w-11 items-center rounded-md px-2 text-sm text-fg-muted"
        >
          {t("overviewBack")}
        </button>
        <p className="min-w-0 flex-1 font-display text-lg tracking-wide">{t("overviewTitle")}</p>
        <button
          type="button"
          data-toggle-lines
          onClick={() => setLinesOn((v) => !v)}
          className="inline-flex h-11 items-center rounded-md px-2 text-xs text-fg-subtle"
        >
          {linesOn ? t("hideLines") : t("seeLines")}
        </button>
      </header>

      <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
        <svg
          viewBox="0 0 200 200"
          className="h-full max-h-full w-full max-w-[900px]"
          role="img"
          aria-label={t("overviewTitle")}
        >
          <defs>
            <radialGradient id="welcome-ink" cx="50%" cy="48%" r="55%">
              <stop offset="0%" stopColor="var(--color-status-perfect)" stopOpacity="0.16" />
              <stop offset="55%" stopColor="var(--color-primary)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--color-bg)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r="96" fill="url(#welcome-ink)" />

          {rings.map((ring) => {
            const r = RING_R[ring.grade - 1] ?? 30;
            const frac = ring.open && ring.total ? ring.perfect / ring.total : 0;
            const active = ring.grade === focusGrade;
            return (
              <g
                key={ring.grade}
                data-ring={ring.grade}
                data-ring-open={ring.open || undefined}
                className="cursor-pointer"
                onClick={() => {
                  if (ring.open) onFocusGrade(ring.grade);
                }}
              >
                <circle
                  cx={CX}
                  cy={CY}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : ring.open ? 1.3 : 1}
                  className={ring.open ? "text-border-strong" : "text-border"}
                  strokeDasharray={ring.open ? undefined : "2 3.2"}
                  opacity={ring.open ? 1 : 0.42}
                />
                {ring.open
                  ? Array.from({ length: TICKS }, (_, i) => {
                      const t = -Math.PI / 2 + (i / TICKS) * Math.PI * 2;
                      const p = polar(r, t);
                      return (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={active ? 0.7 : 0.45}
                          className="fill-border-strong"
                          opacity={active ? 0.55 : 0.28}
                        />
                      );
                    })
                  : null}
                {ring.open && frac > 0 ? (
                  <path
                    d={arcPath(r, Math.min(1, frac))}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 4.2 : 2.4}
                    strokeLinecap="round"
                    className="text-status-perfect"
                    opacity={active ? 1 : 0.7}
                  />
                ) : null}
                <text
                  x={CX}
                  y={CY - r}
                  textAnchor="middle"
                  dy="-2.4"
                  className={active ? "fill-fg" : "fill-fg-subtle"}
                  fontSize={active ? 6 : 4.5}
                >
                  {ring.grade}
                </text>
              </g>
            );
          })}

          {radials.map((line) => (
            <polyline
              key={line.id}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.7"
              className="text-fg-subtle"
              opacity="0.4"
              points={line.points
                .map((p) => {
                  const r = RING_R[p.grade - 1] ?? 30;
                  const t = -Math.PI / 2 + (p.index / p.total) * Math.PI * 2;
                  const { x, y } = polar(r, t);
                  return `${x},${y}`;
                })
                .join(" ")}
            />
          ))}

          {focused ? (
            <g
              className={cn("welcome-orbit", paused && "is-paused", complete && "welcome-lap")}
              data-orbit
              data-orbit-paused={paused || undefined}
              data-overview-cars={shown.length}
            >
              {shown.map((char, i) => {
                const r = RING_R[focused.grade - 1] ?? 54;
                const t = angles[i] ?? -Math.PI / 2;
                const { x, y } = polar(r, t);
                const isFocus = char === focusChar;
                const isGlow = glowOn && Boolean(glow?.includes(char));
                const isHead = i === shown.length - 1;
                const showGlyph = paused && (isFocus || isGlow || isHead || shown.length <= 8);
                const w = isHead ? 9.4 : 7.2;
                const h = isHead ? 6.4 : 5;
                return (
                  <g
                    key={char}
                    transform={`translate(${x} ${y}) rotate(${(t * 180) / Math.PI + 90})`}
                    data-overview-car={char}
                    data-overview-head={isHead || undefined}
                  >
                    <rect
                      x={-w / 2}
                      y={-h / 2}
                      width={w}
                      height={h}
                      rx="1.3"
                      className={cn("fill-status-perfect", isGlow && "welcome-glow")}
                      stroke={isFocus || isHead ? "currentColor" : "none"}
                      strokeWidth={isFocus || isHead ? 0.55 : 0}
                    />
                    {isHead ? (
                      <path
                        d={`M ${w / 2} 0 L ${w / 2 + 2.4} -1.7 L ${w / 2 + 2.4} 1.7 Z`}
                        className="fill-status-perfect"
                      />
                    ) : null}
                    {showGlyph ? (
                      <g transform={`rotate(${-((t * 180) / Math.PI + 90)})`}>
                        <text
                          className="welcome-kanji fill-status-perfect-fg"
                          textAnchor="middle"
                          dy="1.4"
                          fontSize={isFocus || isHead ? 4.8 : 3.4}
                        >
                          {char}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>
      </section>
    </div>
  );
}
