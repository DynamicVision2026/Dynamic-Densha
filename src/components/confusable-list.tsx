import { Link } from "@tanstack/react-router";
import { getKanji } from "@/data/kyoiku";
import type { ConfusablePair } from "@/data/confusable";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function ConfusableList({
  pairs,
  hrefBase,
  childId,
  childGrade,
}: {
  pairs: Array<ConfusablePair & { playable: boolean }>;
  hrefBase: "/demo" | "/app";
  childId?: string;
  childGrade: number;
}) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-border bg-surface px-4 py-4 shadow-soft">
      <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("confuseKicker")}</p>
      <h2 className="mt-1 font-display text-lg">{t("confuseTitle")}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t("confuseLead")}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {pairs.map((pair) => {
          const ga = getKanji(pair.a)?.grade ?? 99;
          const target = ga <= childGrade ? pair.a : pair.b;
          return (
            <li key={`${pair.a}${pair.b}`}>
              {pair.playable ? (
                <Link
                  to={hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char"}
                  params={{ char: target }}
                  search={childId ? { child: childId, mode: "play" } : { mode: "play" }}
                  className="flex h-14 items-center justify-between rounded-md border border-border bg-bg px-3 hover:bg-bg-warm"
                >
                  <span className="font-display text-2xl tracking-widest">
                    {pair.a}
                    <span className="mx-2 text-fg-subtle">/</span>
                    {pair.b}
                  </span>
                  <span className="text-xs text-fg-muted">{t("confusePlay")}</span>
                </Link>
              ) : (
                <div
                  className={cn(
                    "flex h-14 items-center justify-between rounded-md border border-dashed border-border px-3 opacity-55",
                  )}
                >
                  <span className="font-display text-2xl tracking-widest text-fg-subtle">
                    {pair.a}
                    <span className="mx-2">/</span>
                    {pair.b}
                  </span>
                  <span className="text-xs text-fg-subtle">{t("confuseUnopened")}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
