import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { StampBook } from "@/components/stamp-book";
import { Skeleton } from "@/components/ui/skeleton";
import { listChildren } from "@/lib/server/children";
import { getStampBook } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";
import { gradeSearchFrom } from "@/lib/grade-nav";

export const Route = createFileRoute("/app/child/$childId/stamps")({
  component: AppStamps,
  validateSearch: gradeSearchFrom,
});

function AppStamps() {
  const { t } = useI18n();
  const { childId } = Route.useParams();

  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => listChildren(),
  });

  const bookQ = useQuery({
    queryKey: ["stamps", childId],
    queryFn: () => getStampBook({ data: childId }),
  });

  if (childrenQ.isLoading || (childId && bookQ.isLoading) || !bookQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const data = bookQ.data;

  return (
    <AppShell childName={data.child.name} grade={data.child.grade}>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("stampsKicker")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("stampsTitle")}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t("stampsLead")}</p>
        <p className="mt-4 font-display text-xl tabular-nums">
          {t("stampsCount", { n: data.stamps.length })}
        </p>
        <div className="mt-6">
          <StampBook stamps={data.stamps} />
        </div>
      </main>
    </AppShell>
  );
}
