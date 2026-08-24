import type { Stamp } from "@/lib/stamps";
import { useI18n } from "@/lib/i18n/i18n";

function formatStampDate(iso: string, locale: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function StampBook({ stamps }: { stamps: Stamp[] }) {
  const { t, locale } = useI18n();
  if (stamps.length === 0) {
    return (
      <div
        data-tour="stamp-empty"
        className="rounded-lg border border-dashed border-border-strong bg-surface px-5 py-14 text-center"
      >
        <p className="font-display text-lg">{t("stampsEmpty")}</p>
        <p className="mt-2 text-sm text-fg-muted">{t("stampsLead")}</p>
      </div>
    );
  }

  const htmlLocale =
    locale === "zh-Hans" ? "zh-CN" : locale === "zh-Hant" ? "zh-TW" : locale;

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {stamps.map((stamp) => (
        <li key={stamp.kanji} className="flex flex-col items-center gap-2">
          <div
            className="station-stamp grid size-20 place-items-center rounded-full sm:size-24"
            aria-label={`${stamp.kanji} ${t("stampOnce")}`}
          >
            <span className="font-display text-3xl leading-none text-engine">{stamp.kanji}</span>
          </div>
          <p className="text-xs text-fg-subtle">
            {formatStampDate(stamp.perfect_at, htmlLocale)}
          </p>
        </li>
      ))}
    </ul>
  );
}
