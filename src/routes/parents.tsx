import { createFileRoute, Link } from "@tanstack/react-router";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/parents")({ component: Parents });

function Parents() {
  const { t } = useI18n();
  return (
    <main className="paper-wash min-h-dvh px-5 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium tracking-[0.22em] text-fg-subtle">{t("doorParents")}</p>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight">{t("brand")}</h1>
        <p className="mt-4 text-sm leading-7 text-fg-muted">{t("parentsIntro1")}</p>
        <p className="mt-3 text-sm leading-7 text-fg-muted">{t("parentsIntro2")}</p>

        <section className="mt-8">
          <h2 className="font-display text-xl">{t("parentsStepsHeading")}</h2>
          <ol className="mt-3 space-y-3 text-sm leading-7 text-fg-muted">
            <li>
              <span className="font-medium text-fg">{t("parentsStep1Title")}</span>{" "}
              {t("parentsStep1Body")}
            </li>
            <li>
              <span className="font-medium text-fg">{t("parentsStep2Title")}</span>{" "}
              {t("parentsStep2Body")}
            </li>
            <li>
              <span className="font-medium text-fg">{t("parentsStep3Title")}</span>{" "}
              {t("parentsStep3Body")}
            </li>
            <li>
              <span className="font-medium text-fg">{t("parentsStep4Title")}</span>{" "}
              {t("parentsStep4Body")}
            </li>
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">{t("parentsPaceHeading")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">{t("parentsPaceBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">{t("parentsVisibleHeading")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">{t("parentsVisibleBody")}</p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl">{t("parentsDataHeading")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-muted">{t("parentsDataBody")}</p>
        </section>

        <p className="mt-8 text-sm leading-7 text-fg">{t("doorTrustTablet")}</p>
        <p className="text-sm leading-7 text-fg">{t("doorTrustPrice")}</p>

        <Link
          to="/demo/kanji/$char"
          params={{ char: "一" }}
          data-door-try
          className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-primary px-8 font-display text-xl tracking-wide text-primary-fg"
        >
          {t("doorTry")}
        </Link>
        <p className="mt-4 text-center">
          <Link to="/" className="text-xs text-fg-subtle underline-offset-4 hover:underline">
            {t("parentsBack")}
          </Link>
        </p>
      </div>
    </main>
  );
}
