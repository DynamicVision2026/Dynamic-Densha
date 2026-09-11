import { useI18n } from "@/lib/i18n/i18n";

/**
 * 今週の乗車記録 -- the reassurance a parent is actually after, which is
 * rhythm rather than volume: did they ride, did they meet anything new, is
 * anything waiting.
 *
 * The review figure counts まよい and なおし together, because from a parent's
 * side they are one thing ("needs another go") and splitting them invites a
 * reading where one of the two numbers looks like failure.
 *
 * Renders one plain sentence rather than a grid of zeroes when nothing has
 * happened yet. A week of 0 / 0 / 0 is a scoreboard of a bad week; 「今週は
 * まだ乗っていません。」 is a fact.
 */
export function WeeklyRhythm({
  daysRidden,
  newMet,
  reviewDue,
}: {
  daysRidden: number;
  newMet: number;
  reviewDue: number;
}) {
  const { t } = useI18n();
  const quiet = daysRidden === 0 && newMet === 0;

  return (
    <section
      data-weekly-rhythm
      className="mt-4 rounded-xl border border-border bg-surface p-5 sm:p-6"
    >
      <h2 className="font-display text-lg">{t("weekTitle")}</h2>

      {quiet ? (
        <p className="mt-3 text-sm text-fg-muted" data-week-quiet>
          {t("weekNone")}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={t("weekRidden")} value={t("weekDays", { n: daysRidden })} />
          <Stat label={t("weekNewMet")} value={t("weekChars", { n: newMet })} />
          <Stat label={t("weekReviewDue")} value={t("weekChars", { n: reviewDue })} />
        </dl>
      )}

      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-fg-subtle">
        {t("weekTextbookNote")}
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-warm px-4 py-3">
      <dt className="text-xs leading-5 text-fg-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}
