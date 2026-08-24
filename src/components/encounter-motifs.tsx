/** Ink-wash line motifs for 出会う. Stroke only; no live generation. */

import { MOTIF_ELEMENTS } from "../data/encounter-motif-drawings.ts";

const S = "#1c1916";

export function EncounterMotif({ id }: { id: string }) {
  const kind = id.startsWith("motif:") ? id.slice("motif:".length) : id;
  const els = MOTIF_ELEMENTS[kind];
  if (!els) return null;
  return (
    <svg viewBox="0 0 120 80" className="mx-auto h-28 w-full max-w-xs" aria-hidden>
      {els.map((el, i) =>
        el.t === "c" ? (
          <circle
            key={i}
            cx={el.cx}
            cy={el.cy}
            r={el.r}
            fill="none"
            stroke={S}
            strokeWidth={el.w ?? 1.4}
            strokeLinecap="round"
          />
        ) : (
          <path
            key={i}
            d={el.d}
            fill="none"
            stroke={S}
            strokeWidth={el.w ?? 1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}
