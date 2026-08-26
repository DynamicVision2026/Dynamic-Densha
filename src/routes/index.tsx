import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChildShell } from "@/components/child-shell";
import { WelcomeOverview } from "@/components/welcome-overview";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { DEMO_CHILD, getDemoHome } from "@/lib/demo-progress";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";

// Reads localStorage-backed demo progress to paint the train-world preview;
// must stay client-only, same as /demo.
export const Route = createFileRoute("/")({ component: Home, ssr: false });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center text-sm text-fg-muted">漢字でんしゃ</div>
      </ChildShell>
    );
  }
  if (user && !user.isDevFallback) return <Navigate to="/app" />;
  return <WelcomeLanding />;
}

/**
 * The public first screen: a warm, restrained picture-book hero next to the
 * living kanji-train scene, with a single dominant CTA into the demo ride.
 * Decorative only — no real learner data, auth, or API calls.
 */
function WelcomeLanding() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [focusGrade, setFocusGrade] = useState<Grade>(DEMO_CHILD.grade);
  const home = useMemo(() => getDemoHome(DEMO_CHILD.grade), []);
  const hasConsist = home.rings.some((r) => r.consist.length > 0);

  return (
    <main
      data-welcome-landing
      className="paper-wash fixed inset-0 flex h-dvh max-h-dvh flex-col overflow-hidden overscroll-none"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col md:flex-row">
        <div className="flex shrink-0 flex-col gap-3 px-5 pt-[max(1.15rem,env(safe-area-inset-top))] pb-1 md:min-w-[320px] md:max-w-[420px] md:shrink md:justify-center md:gap-5 md:px-10 md:pb-0 lg:max-w-[480px] lg:px-14">
          <p className="text-[11px] font-medium tracking-[0.22em] text-fg-subtle">{t("heroKicker")}</p>
          <h1 className="font-display text-[1.9rem] leading-[1.15] sm:text-4xl md:text-[2.6rem] lg:text-5xl">
            {t("heroTitle1")}
            <br />
            {t("heroTitle2")}
          </h1>
          <p className="hidden max-w-[32ch] text-sm leading-6 text-fg-muted sm:block md:text-base">
            {t("heroLead")}
          </p>
          <Link
            to="/login"
            className="inline-flex h-11 items-center text-xs text-fg-subtle underline-offset-4 hover:underline"
          >
            {t("ctaStart")}
          </Link>
        </div>

        <div className="relative flex min-h-0 flex-1">
          <WelcomeOverview
            rings={home.rings}
            profileGrade={DEMO_CHILD.grade}
            focusGrade={focusGrade}
            hrefBase="/demo"
            variant="landing"
            ctaLabel={hasConsist ? t("welcomeNextStation") : t("welcomeRide")}
            onBack={() => navigate({ to: "/demo" })}
            onFocusGrade={setFocusGrade}
          />
        </div>
      </div>
    </main>
  );
}
