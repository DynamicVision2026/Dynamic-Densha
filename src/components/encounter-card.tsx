import {
  encounterIllustration,
  encounterLines,
  isMotifId,
  TEMPLATE_ILLUSTRATION,
  type Encounter,
} from "@/lib/encounters";
import { EncounterMotif } from "@/components/encounter-motifs";
import { cn } from "@/lib/utils";

function hash(char: string): number {
  let h = 2166136261;
  for (let i = 0; i < char.length; i++) {
    h ^= char.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function InkBlots({ char }: { char: string }) {
  const h = hash(char);
  const a = (h % 70) + 8;
  const b = ((h >>> 8) % 70) + 10;
  const c = ((h >>> 16) % 55) + 20;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <filter id={`ink-${char}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={h % 99} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
      </defs>
      <ellipse cx={a} cy={b} rx="28" ry="18" fill="rgb(28 25 22 / 0.07)" filter={`url(#ink-${char})`} />
      <ellipse cx={100 - a} cy={c} rx="22" ry="26" fill="rgb(28 25 22 / 0.05)" />
      <ellipse cx="50" cy="88" rx="40" ry="10" fill="rgb(28 25 22 / 0.04)" />
    </svg>
  );
}

export function EncounterCard({
  char,
  encounter,
  strokesLabel,
}: {
  char: string;
  encounter: Encounter | null;
  strokesLabel?: string;
}) {
  const art = encounter ? encounterIllustration(encounter) : TEMPLATE_ILLUSTRATION;
  const lines = encounter ? encounterLines(encounter.body_ja) : [];
  const custom = isMotifId(art);

  return (
    <section className="mt-8 text-center">
      {strokesLabel ? (
        <p className="text-xs tracking-[0.28em] text-fg-subtle">{strokesLabel}</p>
      ) : null}
      <div
        className={cn(
          "encounter-wash relative mx-auto mt-5 overflow-hidden rounded-xl border border-border px-4 py-8",
        )}
      >
        <InkBlots char={char} />
        {custom ? <EncounterMotif id={art} /> : null}
        <p className="relative font-display text-8xl leading-none text-fg">{char}</p>
      </div>
      {encounter?.title_ja ? (
        <p className="mt-5 text-xs tracking-[0.2em] text-fg-subtle">{encounter.title_ja}</p>
      ) : null}
      <div className="mt-5 space-y-1 font-display text-lg leading-8 text-fg-muted">
        {lines.length ? lines.map((line, i) => <p key={`${i}-${line}`}>{line}</p>) : <p>{char}</p>}
      </div>
    </section>
  );
}
