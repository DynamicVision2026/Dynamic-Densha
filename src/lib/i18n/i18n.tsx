import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALES,
  LOCALE_META,
  MESSAGES,
  type Locale,
  type MessageKey,
} from "./messages";

const STORAGE_KEY = "densha.locale";

function isLocale(v: string | null): v is Locale {
  return Boolean(v && (LOCALES as readonly string[]).includes(v));
}

function readStored(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

type Vars = Record<string, string | number>;

function fill(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

type I18nValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ja");

  useEffect(() => {
    setLocaleState(readStored() ?? "ja");
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].html;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => fill(MESSAGES[locale][key], vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
