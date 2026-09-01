import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChildHome } from "@/components/child-home";
import { ChildShell } from "@/components/child-shell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WelcomeOverview } from "@/components/welcome-overview";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Grade } from "@/data/kyoiku";
import { doorRings } from "@/lib/door-scene";
import { DEMO_CHILD, getDemoHome, getDemoMap } from "@/lib/demo-progress";
import { hasGuestRidden } from "@/lib/guest-ride";
import { useI18n } from "@/lib/i18n/i18n";
import { useNow } from "@/lib/use-now";

export const Route = createFileRoute("/")({ component: Home, ssr: false });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [ridden] = useState(() => hasGuestRidden());

  if (isPending) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center text-sm text-fg-muted">漢字でんしゃ</div>
      </ChildShell>
    );
  }
  if (user && !user.isDevFallback) return <Navigate to="/app" />;
  if (ridden) return <GuestChildHome />;
  return <WelcomeLanding />;
}

function GuestChildHome() {
  const viewGrade = resolveActiveGrade({
    urlGrade: undefined,
    profileGrade: DEMO_CHILD.grade,
  });
  usePersistActiveGrade(viewGrade);
  // Re-render on visibilitychange/focus/midnight so a board left open
  // overnight rebuilds from a fresh clock instead of freezing at mount (PI-3).
  useNow();
  const home = getDemoHome(viewGrade);
  const map = getDemoMap(viewGrade);
  const cars = home.trains.flatMap((t) =>
    t.cars.map((c) => ({ char: c.char, status: c.status, echoDue: c.echoDue })),
  );

  return (
    <ChildHome
      hrefBase="/demo"
      grade={viewGrade}
      profileGrade={DEMO_CHILD.grade}
      cars={cars}
      board={home.board}
      echoQueue={home.echoQueue}
      lines={map.lines}
      rings={home.rings}
    />
  );
}

function WelcomeLanding() {
  const { t } = useI18n();
  const [focusGrade, setFocusGrade] = useState<Grade>(1);
  const rings = useMemo(() => doorRings(1), []);

  return (
    <main
      data-welcome-landing
      className="paper-wash fixed inset-0 flex h-dvh max-h-dvh flex-col overflow-hidden overscroll-none"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col md:flex-row">
        <div className="relative z-[3] flex shrink-0 flex-col gap-3 overflow-y-auto px-5 pt-[max(1.15rem,env(safe-area-inset-top))] pb-3 md:min-w-[320px] md:max-w-[420px] md:shrink md:justify-center md:gap-5 md:px-10 md:pb-0 lg:max-w-[480px] lg:px-14">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium tracking-[0.22em] text-fg-subtle">{t("heroKicker")}</p>
            <LanguageSwitcher />
          </div>
          <h1 className="font-display text-[1.9rem] leading-[1.15] sm:text-4xl md:text-[2.6rem] lg:text-5xl">
            {t("heroTitle1")}
            <br />
            {t("heroTitle2")}
          </h1>
          <p className="max-w-[32ch] whitespace-pre-line text-sm leading-6 text-fg-muted md:text-base">
            {t("heroLead")}
          </p>

          <div className="flex w-full max-w-md flex-col gap-3">
            <Link
              to="/demo/kanji/$char"
              params={{ char: "一" }}
              data-door-try
              data-welcome-cta
              className="inline-flex h-14 w-full items-center justify-center rounded-xl bg-primary px-8 font-display text-xl tracking-wide text-primary-fg sm:h-16 sm:text-2xl"
            >
              {t("doorTry")}
            </Link>
            <Link
              to="/parents"
              data-door-parents
              className="inline-flex h-14 w-full items-center justify-center rounded-xl border-2 border-fg bg-transparent px-8 font-display text-xl tracking-wide text-fg sm:h-16 sm:text-2xl"
            >
              {t("doorParents")}
            </Link>
            <Link
              to="/login"
              data-door-login
              className="inline-flex h-14 w-full items-center justify-center rounded-xl border-2 border-fg bg-transparent px-8 font-display text-xl tracking-wide text-fg sm:h-16 sm:text-2xl"
            >
              {t("doorLogin")}
            </Link>
          </div>

          <p className="text-sm leading-6 text-fg">{t("doorTrustTablet")}</p>
          <p className="-mt-2 text-sm leading-6 text-fg">{t("doorTrustPrice")}</p>
        </div>

        <div className="relative flex min-h-0 flex-1 [@media(max-height:480px)]:hidden">
          <WelcomeOverview
            rings={rings}
            profileGrade={1}
            focusGrade={focusGrade}
            hrefBase="/demo"
            variant="landing"
            onBack={() => undefined}
            onFocusGrade={setFocusGrade}
          />
        </div>
      </div>
    </main>
  );
}
