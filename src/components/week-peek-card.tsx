import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n/i18n";
import type { WeekPeek } from "@/lib/week-peek";
import type { Grade } from "@/data/kyoiku";

export function WeekPeekCard({
  peek,
  hrefBase,
  grade,
}: {
  peek: WeekPeek;
  hrefBase: "/demo" | "/app";
  grade?: Grade;
}) {
  const { t } = useI18n();
  const isLine = peek.kind === "line";
  const to = isLine
    ? hrefBase === "/demo"
      ? "/demo/map"
      : "/app/map"
    : hrefBase === "/demo"
      ? "/demo/workshop"
      : "/app/workshop";
  const search = isLine ? { grade, line: peek.id } : { grade, family: peek.id };

  return (
    <div
      className="mt-4 rounded-lg border border-border bg-surface px-5 py-4"
      data-week-peek
      data-week-peek-kind={peek.kind}
    >
      <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("peekTitle")}</p>
      <p className="mt-1 font-display text-lg">{peek.label}</p>
      <p className="mt-1 text-sm text-fg-muted">{t("peekLead")}</p>
      <p className="mt-2 text-sm text-fg-subtle">
        <span className="font-display text-xl text-fg">{peek.kanji}</span>
        <span className="ml-2">
          {isLine ? t("peekLineKind") : t("peekFamilyKind")}
        </span>
      </p>
      <Link
        to={to}
        search={search}
        data-tour="week-peek"
        className="mt-3 inline-flex h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg"
      >
        {t("peekOpen")}
      </Link>
    </div>
  );
}
