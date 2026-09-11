import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * The number a parent opens this page for.
 *
 * TWO readings, and the order between them is the whole design:
 *
 * 「これまでのかんぺき: 142両」 leads, and has NO denominator. It is the count
 * of cars that have ever turned green, read from child_stamps -- a table that
 * is append-only by construction (`on conflict (child_id, kanji) do nothing`,
 * written only on justReachedPerfect). So it only ever goes up. It survives a
 * grade change, it survives an echo the child later fails, and it survives
 * us shipping more characters. A parent checking in after a hard week is
 * never shown a smaller number than last time.
 *
 * 「4年生の進捗: 31 / 80両」 follows, smaller, and is pinned to teach-ready
 * characters: teachReadyPerfect over teachReadyTotal, the pair
 * buildParentReport already computes.
 *
 * NO PERCENTAGE, anywhere, deliberately. A percentage has the fraction's
 * denominator inside it, so the day we ship twenty more characters for a year
 * every family's percentage falls without a single child forgetting anything.
 * A fraction moves the same way but shows its working -- the parent can see
 * the right-hand number grew -- which is why the footnote naming the
 * denominator sits directly under it rather than at the bottom of the page.
 */
export function MasteryHero({
  childId,
  grade,
  cumulativePerfect,
  gradePerfect,
  gradeTotal,
}: {
  childId: string;
  grade: number;
  /** child_stamps count: cars that have EVER been green. Monotonic. */
  cumulativePerfect: number;
  gradePerfect: number;
  gradeTotal: number;
}) {
  const { t } = useI18n();
  return (
    <section
      data-mastery-hero
      className="mt-5 rounded-xl border border-border bg-surface p-5 shadow-soft sm:p-6"
    >
      <p className="text-sm text-fg-muted">{t("masteryCumulative")}</p>
      <p
        data-mastery-cumulative={cumulativePerfect}
        className="mt-1 flex items-baseline gap-2 font-display text-4xl tabular-nums text-status-perfect sm:text-5xl"
      >
        <span aria-hidden className="text-2xl sm:text-3xl">
          🟩
        </span>
        {t("masteryCars", { n: cumulativePerfect })}
      </p>

      <div className="mt-4 border-t border-border pt-4">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg-muted">
          <span>{t("masteryGradeProgress", { grade })}</span>
          <span data-mastery-grade className="font-display text-lg tabular-nums text-fg">
            {gradePerfect} / {t("masteryCars", { n: gradeTotal })}
          </span>
        </p>
        <p data-mastery-denom-note className="mt-1 text-xs leading-5 text-fg-subtle">
          {t("masteryDenomNote")}
        </p>
      </div>

      <Link
        to="/app/child/$childId"
        params={{ childId }}
        data-mastery-open-map
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm text-primary-fg shadow-soft sm:w-auto"
      >
        {t("masteryOpenMap")}
      </Link>
    </section>
  );
}
