import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthSlot } from "@/components/auth-slot";
import { LanguageSwitcher } from "@/components/language-switcher";
import { GRADE_COUNTS } from "@/data/kyoiku";
import { EngineCar, KanjiCar } from "@/components/kanji-car";
import { StatusLegend } from "@/components/status-legend";
import { WatchDemoButton } from "@/components/auto-demo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useI18n } from "@/lib/i18n/i18n";
import { inFramedPreview } from "@/lib/in-preview";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLE = [
  { char: "春", status: "perfect" as const },
  { char: "夏", status: "almost" as const },
  { char: "秋", status: "fix" as const },
  { char: "冬", status: "lost" as const },
  { char: "花", status: "new" as const },
];

function Home() {
  const { user } = useCurrentUserState();
  const { t } = useI18n();
  const [framed, setFramed] = useState(false);
  useEffect(() => setFramed(inFramedPreview()), []);
  return (
    <div className="paper-wash min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <p className="min-w-0 truncate font-display text-lg tracking-wide">{t("brand")}</p>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <AuthSlot />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        {framed ? (
          <p className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-6 text-fg-muted">
            {t("cookieBanner")}
          </p>
        ) : null}
        <section className="grid gap-10 pb-16 pt-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs tracking-[0.28em] text-fg-subtle">{t("heroKicker")}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight text-fg sm:text-5xl">
              {t("heroTitle1")}
              <br />
              {t("heroTitle2")}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-fg-muted">{t("heroLead")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WatchDemoButton />
              <Link
                to="/demo"
                className="inline-flex h-12 items-center rounded-lg border border-border bg-surface px-6 text-sm"
              >
                {t("ctaRide")}
              </Link>
              <Link
                to={user ? "/app" : "/login"}
                className="inline-flex h-12 items-center rounded-lg border border-border bg-surface px-6 text-sm"
              >
                {user ? t("ctaOpen") : t("ctaStart")}
              </Link>
            </div>
          </div>
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-6 shadow-soft">
            <p className="text-xs text-fg-subtle">{t("sampleTrain")}</p>
            <div className="relative mt-6 overflow-x-auto pb-2">
              <div className="track-line absolute inset-x-0 top-[2.25rem] h-px" />
              <div className="relative flex items-end gap-1.5">
                <EngineCar index={1} />
                {SAMPLE.map((c) => (
                  <KanjiCar
                    key={c.char}
                    char={c.char}
                    status={c.status}
                    to={`/demo/kanji/${encodeURIComponent(c.char)}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-6">
              <StatusLegend />
            </div>
            <p className="mt-4 text-center text-xs text-fg-subtle">{t("sampleHint")}</p>
          </div>
        </section>

        <section id="method" className="grid gap-4 sm:grid-cols-3">
          {[
            { t: t("methodTrain"), d: t("methodTrainBody") },
            { t: t("methodPuzzle"), d: t("methodPuzzleBody") },
            { t: t("methodParent"), d: t("methodParentBody") },
          ].map((item) => (
            <article key={item.t} className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-display text-lg">{item.t}</h2>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{item.d}</p>
            </article>
          ))}
        </section>

        <section className="mt-14 rounded-xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="font-display text-2xl">{t("gradeTable")}</h2>
          <p className="mt-2 text-sm text-fg-muted">{t("gradeTableLead")}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {([1, 2, 3, 4, 5, 6] as const).map((g) => (
              <Link
                key={g}
                to="/demo"
                search={{ grade: g }}
                className="rounded-lg bg-bg px-3 py-4 text-center hover:bg-bg-warm"
              >
                <dt className="text-xs text-fg-subtle">{t("gradeN", { n: g })}</dt>
                <dd className="mt-1 font-display text-2xl tabular-nums">{GRADE_COUNTS[g]}</dd>
                <dd className="text-[11px] text-fg-subtle">{t("charUnit")}</dd>
              </Link>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
