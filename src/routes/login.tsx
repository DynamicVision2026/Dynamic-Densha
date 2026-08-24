import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n/i18n";
import { inFramedPreview } from "@/lib/in-preview";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { t } = useI18n();
  const [framed, setFramed] = useState(false);
  useEffect(() => setFramed(inFramedPreview()), []);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "up") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0] || t("parentDefaultName"),
          callbackURL: "/app",
        });
        if (err) throw new Error(err.message);
      }
      const { error: err } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/app",
      });
      if (err) throw new Error(err.message);
      const session = await authClient.getSession();
      if (!session.data?.user) {
        setError(t("cookieEmailFail"));
        return;
      }
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="paper-wash grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-soft sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.28em] text-fg-subtle">{t("loginKicker")}</p>
            <h1 className="mt-2 font-display text-3xl">{t("brand")}</h1>
          </div>
          <LanguageSwitcher />
        </div>
        <p className="mt-2 text-sm text-fg-muted">{t("loginLead")}</p>
        {framed ? (
          <p className="mt-3 rounded-md border border-border bg-bg px-3 py-2 text-xs leading-5 text-fg-muted">
            {t("cookieBanner")}
          </p>
        ) : null}

        {authEnabled ? (
          <div className="mt-6 space-y-3">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/app" })}
              >
                {t("continueWith", { label: p.label })}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{t("signInDisabled")}</p>
        )}

        <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          {t("email")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="mb-4 flex rounded-full border border-border p-0.5 text-sm">
          <button
            type="button"
            className={`h-9 flex-1 rounded-full ${mode === "in" ? "bg-fg text-bg" : "text-fg-muted"}`}
            onClick={() => setMode("in")}
          >
            {t("logIn")}
          </button>
          <button
            type="button"
            className={`h-9 flex-1 rounded-full ${mode === "up" ? "bg-fg text-bg" : "text-fg-muted"}`}
            onClick={() => setMode("up")}
          >
            {t("signUp")}
          </button>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          {mode === "up" ? (
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("yourName")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !authEnabled}>
            {busy ? t("pleaseWait") : mode === "up" ? t("startRegister") : t("logIn")}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-fg-subtle">
          <Link to="/demo" className="underline-offset-4 hover:underline">
            {t("ctaRide")}
          </Link>
          <span className="mx-2">·</span>
          <Link to="/" className="underline-offset-4 hover:underline">
            {t("backTop")}
          </Link>
        </p>
      </div>
    </main>
  );
}
