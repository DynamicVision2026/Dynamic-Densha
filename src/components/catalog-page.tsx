import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { GradeSwitcher } from "@/components/grade-switcher";
import { KanjiSearch } from "@/components/kanji-search";
import { GRADE_COUNTS, getKanji, type Grade } from "@/data/kyoiku";
import { GRADES, searchKyoiku } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";

export function CatalogPage({
  hrefBase,
  childName,
  childGrade,
  viewGrade,
  query,
}: {
  hrefBase: "/demo" | "/app";
  childName?: string;
  childGrade: Grade;
  viewGrade?: Grade;
  query: string;
}) {
  const { t } = useI18n();
  const catalogTo = hrefBase === "/demo" ? "/demo/catalog" : "/app/catalog";
  const grade = viewGrade;
  const hits = searchKyoiku(query, grade ?? "all");
  const exactMiss = query.trim().length === 1 && !getKanji(query.trim());
  const empty = hits.length === 0;

  return (
    <AppShell childName={childName} grade={childGrade}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("catalogKicker")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("catalogTitle")}</h1>
        <p className="mt-2 max-w-lg text-sm text-fg-muted">{t("catalogLead")}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <GradeSwitcher
            value={grade}
            hrefBase={catalogTo}
            search={query ? { q: query } : undefined}
          />
          <KanjiSearch hrefBase={hrefBase} defaultQuery={query} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Link
            to={catalogTo}
            search={query ? { q: query } : {}}
            className={`inline-flex h-11 items-center rounded-full px-3 ${
              !grade ? "bg-fg text-bg" : "border border-border bg-surface text-fg-muted"
            }`}
          >
            {t("catalogAllGrades")}
          </Link>
          <p className="text-fg-subtle tabular-nums">
            {t("catalogHits", { n: hits.length })}
            {grade ? ` · ${t("gradeN", { n: grade })} ${GRADE_COUNTS[grade]}${t("charUnit")}` : ""}
          </p>
        </div>

        {exactMiss || empty ? (
          <p className="mt-10 text-center text-sm text-fg-muted" data-tour="catalog-empty">
            {t("notInList")}
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
            {hits.map((k) => (
              <li key={k.char}>
                <Link
                  to={hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char"}
                  params={{ char: k.char }}
                  search={{ grade: k.grade }}
                  className="flex h-16 flex-col items-center justify-center rounded-md border border-border bg-surface hover:bg-bg-warm"
                  aria-label={`${k.char} ${t("gradeLabel", { n: k.grade })}`}
                >
                  <span className="font-display text-2xl leading-none">{k.char}</span>
                  <span className="mt-1 text-[10px] text-fg-subtle">{t("gradeN", { n: k.grade })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {grade ? (
          <p className="mt-8 text-center text-sm">
            <Link to={hrefBase} search={{ grade }} className="underline">
              {t("catalogJump", { n: grade })}
            </Link>
          </p>
        ) : (
          <p className="mt-8 text-center text-sm text-fg-subtle">
            {GRADES.map((n) => `${t("gradeN", { n })} ${GRADE_COUNTS[n]}`).join(" · ")}
          </p>
        )}
      </main>
    </AppShell>
  );
}
