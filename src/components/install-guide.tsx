import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { detectInstallPlatform, isStandaloneDisplay, type InstallPlatform } from "@/lib/install-platform";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * Add-to-home-screen guidance. Placed BELOW the ride CTA everywhere it
 * appears (spec §3.3) -- riding comes first; a parent who has just paid
 * should be one tap from their child using the thing, not one tap from a
 * housekeeping chore.
 *
 * Renders nothing once the app is already running standalone.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** iOS's Share glyph, drawn rather than screenshotted -- a screenshot ages with every iOS release. */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function Step({ n, children, glyph }: { n: number; children: string; glyph?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg-muted">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-warm text-[11px] text-fg">
        {n}
      </span>
      {glyph ? <ShareGlyph /> : null}
      <span>{children}</span>
    </li>
  );
}

export function InstallGuide() {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setStandalone(
      isStandaloneDisplay({
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
        navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      }),
    );
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep our own button as the trigger
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  // Nothing to render until the platform is known (SSR has no navigator), and
  // nothing worth rendering once it's already on the home screen.
  if (platform === null || standalone) return null;

  return (
    <section data-install-guide={platform} className="mt-10 border-t border-border pt-6 text-left">
      <p className="text-sm leading-6 text-fg">{t("installTitle")}</p>

      {deferredPrompt ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => {
            void deferredPrompt.prompt();
            setDeferredPrompt(null);
          }}
        >
          {t("installPromptCta")}
        </Button>
      ) : platform === "ios" ? (
        <ol className="mt-3 space-y-2">
          <Step n={1} glyph>
            {t("installIosStep1")}
          </Step>
          <Step n={2}>{t("installIosStep2")}</Step>
          <Step n={3}>{t("installIosStep3")}</Step>
        </ol>
      ) : (
        <ol className="mt-3 space-y-2">
          <Step n={1}>{t("installAndroidStep")}</Step>
        </ol>
      )}

      {/*
        Whether an iOS home-screen launch inherits the Safari session has
        historically depended on the iOS version, and it has not been
        verified on real hardware for this app -- so this says "may", which
        is the honest phrasing under that uncertainty. Once someone has
        actually tested it on a real iPhone and iPad, this either goes away
        or becomes a flat statement.
      */}
      <p className="mt-3 text-xs leading-5 text-fg-subtle">{t("installSessionNote")}</p>
    </section>
  );
}
