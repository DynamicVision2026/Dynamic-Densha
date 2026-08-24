import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { getKanji } from "@/data/kyoiku";
import { resolveLookup } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";

export function KanjiSearch({
  hrefBase,
  defaultQuery = "",
}: {
  hrefBase: "/demo" | "/app";
  defaultQuery?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState(defaultQuery);

  function go(e: FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    if (trimmed.length === 1) {
      const k = getKanji(trimmed);
      if (k) {
        openChar(k.char);
        return;
      }
      openCatalog(trimmed);
      return;
    }
    const found = resolveLookup(trimmed);
    if (found.hit) {
      openChar(found.hit.char);
      return;
    }
    openCatalog(trimmed);
  }

  function openChar(char: string) {
    if (hrefBase === "/demo") {
      void navigate({ to: "/demo/kanji/$char", params: { char } });
    } else {
      void navigate({ to: "/app/kanji/$char", params: { char } });
    }
  }

  function openCatalog(query: string) {
    if (hrefBase === "/demo") {
      void navigate({ to: "/demo/catalog", search: { q: query } });
    } else {
      void navigate({ to: "/app/catalog", search: { q: query } });
    }
  }

  return (
    <form onSubmit={go} className="min-w-0 flex-1" data-tour="kanji-search">
      <label className="sr-only" htmlFor={`kanji-q-${hrefBase}`}>
        {t("catalogSearchPh")}
      </label>
      <Input
        id={`kanji-q-${hrefBase}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("catalogSearchPh")}
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
