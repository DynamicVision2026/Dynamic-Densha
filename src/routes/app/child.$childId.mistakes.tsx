import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import type { PracticeKind } from "@/lib/mastery";
import { listMistakes } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

export const Route = createFileRoute("/app/child/$childId/mistakes")({
  component: MistakesPage,
});

const KIND_LABEL: Record<string, MessageKey> = {
  reading: "kindReading",
  meaning: "kindMeaning",
  shape: "kindShape",
};

function MistakesPage() {
  const { t } = useI18n();
  const { childId } = Route.useParams();
  const q = useQuery({
    queryKey: ["mistakes", childId],
    queryFn: () => listMistakes({ data: childId }),
    enabled: Boolean(childId),
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-lg px-5 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("parent")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("mistakes")}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t("mistakesLead")}</p>

        {!childId || q.isLoading ? (
          <Skeleton className="mt-8 h-40 w-full rounded-xl" />
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface">
            {(q.data ?? []).length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-fg-muted">{t("noMistakes")}</li>
            ) : (
              (q.data ?? []).map((row, i) => (
                <li key={`${row.created_at}-${i}`} className="flex items-center gap-3 px-5 py-3">
                  <Link
                    to="/app/child/$childId/kanji/$char"
                    params={{ childId, char: row.kanji }}
                    search={{ mode: "play" }}
                    className="font-display text-2xl"
                  >
                    {row.kanji}
                  </Link>
                  <span className="text-xs text-fg-subtle">
                    {t(KIND_LABEL[row.kind as PracticeKind] ?? "kindReading")}
                  </span>
                  <span className="ml-auto truncate text-sm text-fg-muted">{row.answer}</span>
                </li>
              ))
            )}
          </ul>
        )}

        <p className="mt-8 text-center">
          <Link to="/app/parent" search={{ child: childId }} className="text-sm text-fg-muted">
            {t("backInsight")}
          </Link>
        </p>
      </main>
    </AppShell>
  );
}
