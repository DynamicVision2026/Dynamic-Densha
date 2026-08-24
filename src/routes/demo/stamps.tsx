import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { StampBook } from "@/components/stamp-book";
import { DEMO_CHILD, listDemoStamps } from "@/lib/demo-progress";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/demo/stamps")({
  component: DemoStamps,
  ssr: false,
  validateSearch: gradeSearchFrom,
});

function DemoStamps() {
  const { t } = useI18n();
  const stamps = listDemoStamps();

  return (
    <AppShell childName={t("demoName")} grade={DEMO_CHILD.grade}>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("stampsKicker")}</p>
        <h1 className="mt-1 font-display text-3xl" data-tour="stamps-title">{t("stampsTitle")}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t("stampsLead")}</p>
        <p className="mt-4 font-display text-xl tabular-nums">
          {t("stampsCount", { n: stamps.length })}
        </p>
        <div className="mt-6">
          <StampBook stamps={stamps} />
        </div>
      </main>
    </AppShell>
  );
}
