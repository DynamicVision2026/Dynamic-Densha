import { useEffect, useMemo, useState } from "react";
import { familyRadials, type GradeRingView } from "@/lib/train-overview";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 100;
const RING_R = [28, 40, 52, 64, 76, 88];
const CAR_CAP = 16;

function polar(r: number, t: number) {
  return { x: CX + r * Math.cos(t), y: CY + r * Math.sin(t) };
}

function arcPath(r: number, frac: number) {
  const start = -Math.PI / 2;
  const end = start + Math.max(0.001, Math.min(0.999, frac)) * Math.PI * 2;
  const a = polar(r, start);
  const b = polar(r, end);
  const large = frac > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
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

  useEffect(() => {
    if (!glow?.length) return;
    setGlowOn(true);
    const id = window.setTimeout(() => setGlowOn(false), 1100);
    return () => window.clearTimeout(id);
  }, [glow]);

  const near = Boolean(focusChar);
  const consist = focused?.consist ?? [];
  const shown = near
    ? consist.filter((c) => c === focusChar).concat(consist.filter((c) => c !== focusChar)).slice(0, CAR_CAP)
    : consist.slice(Math.max(0, consist.length - CAR_CAP));

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
          className={cn(
            "h-full max-h-full w-full max-w-[900px] welcome-orbit",
            glowOn && "is-paused",
            complete && "welcome-lap",
          )}
          role="img"
          aria-label={t("overviewTitle")}
          data-orbit
        >
            {rings.map((ring) => {
              const r = RING_R[ring.grade - 1] ?? 28;
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
                    strokeWidth={active ? 2.4 : 1.2}
                    className={ring.open ? "text-border-strong" : "text-border"}
                    strokeDasharray={ring.open ? undefined : "2 3"}
                    opacity={ring.open ? 1 : 0.45}
                  />
                  {ring.open && frac > 0 ? (
                    <path
                      d={arcPath(r, Math.min(1, frac))}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={active ? 3.2 : 2}
                      strokeLinecap="round"
                      className="text-status-perfect"
                    />
                  ) : null}
                  <text
                    x={CX}
                    y={CY - r}
                    textAnchor="middle"
                    dy="-2"
                    className="fill-fg-subtle"
                    fontSize="5"
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
                strokeWidth="0.6"
                className="text-fg-subtle"
                opacity="0.45"
                points={line.points
                  .map((p) => {
                    const r = RING_R[p.grade - 1] ?? 28;
                    const t = -Math.PI / 2 + (p.index / p.total) * Math.PI * 2;
                    const { x, y } = polar(r, t);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            ))}

            {focused && shown.map((char, i) => {
              const r = RING_R[focused.grade - 1] ?? 52;
              const t = -Math.PI / 2 + ((focused.perfect - shown.length + i + 0.5) / Math.max(focused.total, 1)) * Math.PI * 2;
              const { x, y } = polar(r, t);
              const isFocus = char === focusChar;
              const isGlow = glowOn && glow?.includes(char);
              return (
                <g key={char} transform={`translate(${x} ${y})`} data-overview-car={char}>
                  <rect
                    x={-3.2}
                    y={-2.2}
                    width="6.4"
                    height="4.4"
                    rx="1.1"
                    className={cn(
                      "fill-status-perfect",
                      isGlow && "welcome-glow",
                      isFocus && "stroke-fg",
                    )}
                    stroke={isFocus ? "currentColor" : "none"}
                    strokeWidth={isFocus ? 0.6 : 0}
                  />
                  {near || isFocus ? (
                    <text
                      textAnchor="middle"
                      dy="1.2"
                      fontSize={isFocus ? 5.5 : 3.6}
                      className="fill-status-perfect-fg"
                    >
                      {char}
                    </text>
                  ) : null}
                </g>
              );
            })}
        </svg>
      </section>
    </div>
  );
}
