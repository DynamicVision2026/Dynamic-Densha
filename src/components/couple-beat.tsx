import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Green-only 到着 couple: stage visuals. CTAs live in the ride action zone. */
export function CoupleBeat({
  char,
  count,
  added,
  gradeComplete,
  onSkip,
}: {
  char: string;
  count: number;
  added: number;
  gradeComplete?: boolean;
  onSkip?: () => void;
}) {
  const { t } = useI18n();
  const [done, setDone] = useState(prefersReducedMotion());
  const ghosts = Math.min(5, Math.max(0, count - 1));
  const from = Math.max(0, count - Math.max(added, 1));

  useEffect(() => {
    if (done) return;
    const ms = prefersReducedMotion() ? 160 : 1900;
    const id = window.setTimeout(() => setDone(true), ms);
    return () => window.clearTimeout(id);
  }, [done]);

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", done && "couple-done")}
      data-couple-beat
      data-couple-count={count}
      data-couple-added={added}
      data-grade-complete={gradeComplete || undefined}
      data-couple-ready={done || undefined}
      onClick={() => {
        setDone(true);
        onSkip?.();
      }}
    >
      <section
        className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
        data-tour="feedback"
      >
        <p className="couple-bloom font-display text-2xl tracking-wide">{t("coupleTitle")}</p>
        <div className="couple-consist mt-5 flex items-end justify-center gap-1" aria-hidden>
          {Array.from({ length: ghosts }).map((_, i) => (
            <span
              key={i}
              className="couple-ghost mb-2 inline-block h-8 w-10 rounded-md bg-status-perfect/70"
            />
          ))}
          {ghosts > 0 ? <span className="couple-hitch mb-5 h-1 w-3 rounded-full bg-status-perfect" /> : null}
          <div className="couple-car relative">
            <p className="grid size-24 place-items-center rounded-md bg-status-perfect font-display text-6xl leading-none text-status-perfect-fg">
              {char}
            </p>
            <span className="couple-puff" aria-hidden />
          </div>
        </div>
        <p className="couple-rail mt-3 h-1.5 w-52 rounded-full bg-border-strong" />
        {gradeComplete ? (
          <p className="couple-count mt-4 font-display text-lg">{t("gradeCompleteLap")}</p>
        ) : (
          <p className="couple-count mt-4 font-display text-3xl tabular-nums" data-split-flap>
            <span className="couple-flap-from">{t("coupleCars", { n: from })}</span>
            <span className="couple-flap-to">{t("coupleCars", { n: count })}</span>
          </p>
        )}
      </section>
    </div>
  );
}
