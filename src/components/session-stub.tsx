import { cn } from "@/lib/utils";

export function SessionStub({
  glyphs,
  returnLabel,
  serial,
  issueDay,
  domain = "kanji-densha",
  status = "almost",
  title = "だいたい",
}: {
  glyphs: string[];
  returnLabel: string;
  serial: string;
  issueDay: string;
  domain?: string;
  /** Even if perfect is passed, copy stays だいたい. */
  status?: string;
  title?: string;
}) {
  const toneFix = status === "fix";
  const heading = title || "だいたい";
  return (
    <article
      data-session-stub
      data-stub-tone={toneFix ? "fix" : "almost"}
      className={cn(
        "relative mx-auto w-full max-w-[448px] overflow-hidden rounded-md border-2 border-primary",
        toneFix ? "bg-ticket-amber" : "bg-ticket-mint",
      )}
    >
      <span
        aria-hidden
        className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-bg"
      />
      <span
        aria-hidden
        className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-bg"
      />
      <header className="flex h-12 items-center justify-between gap-3 bg-primary px-4 text-primary-fg">
        <p className="font-display text-lg leading-none">{heading}</p>
        <p className="overflow-hidden text-xs tracking-wide whitespace-nowrap">{serial}</p>
      </header>
      <div className="px-5 py-4 text-ticket-ink">
        <p className="font-display text-3xl leading-none tracking-wide">{glyphs.join(" ")}</p>
        <p className="mt-3 font-display text-4xl leading-none">{returnLabel}</p>
        <p className="mt-3 max-h-12 overflow-hidden text-sm leading-6 text-fg-muted">
          {heading}の きっぷ。つぎの とうちゃくは うえ。
        </p>
      </div>
      <footer className="flex h-8 items-center justify-between gap-3 overflow-hidden border-t border-primary/30 px-4 text-[11px] text-fg-subtle whitespace-nowrap">
        <span>{domain}</span>
        <span>{issueDay}</span>
      </footer>
    </article>
  );
}