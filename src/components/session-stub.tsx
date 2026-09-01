import { TICKET_QR_HREF, TICKET_QR_MATRIX } from "@/lib/ticket-qr";
import { cn } from "@/lib/utils";

function TicketQrMark() {
  const n = TICKET_QR_MATRIX.length;
  const quiet = 2;
  const dim = n + quiet * 2;
  const cells: string[] = [];
  for (let r = 0; r < n; r++) {
    const row = TICKET_QR_MATRIX[r]!;
    for (let c = 0; c < n; c++) {
      if (row[c] !== "1") continue;
      cells.push(`${c + quiet} ${r + quiet}`);
    }
  }
  return (
    <svg
      data-ticket-qr
      data-qr-href={TICKET_QR_HREF}
      viewBox={`0 0 ${dim} ${dim}`}
      width="64"
      height="64"
      className="shrink-0 bg-surface"
      role="img"
      aria-label={TICKET_QR_HREF}
    >
      <rect width={dim} height={dim} fill="currentColor" className="text-surface" />
      {cells.map((p) => {
        const [x, y] = p.split(" ");
        return <rect key={p} x={x} y={y} width="1" height="1" className="text-ticket-ink" fill="currentColor" />;
      })}
    </svg>
  );
}

export function SessionStub({
  glyphs,
  returnLabel,
  serial,
  issueDay,
  domain = "kanji-densha",
  status = "almost",
  title = "だいたい",
  qrHref = TICKET_QR_HREF,
}: {
  glyphs: string[];
  returnLabel: string;
  serial: string;
  issueDay: string;
  domain?: string;
  /** Even if perfect is passed, copy stays だいたい. */
  status?: string;
  title?: string;
  qrHref?: string;
}) {
  const toneFix = status === "fix";
  const heading = title || "だいたい";
  return (
    <article
      data-session-stub
      data-stub-tone={toneFix ? "fix" : "almost"}
      data-qr-href={qrHref}
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
      <div className="flex items-start justify-between gap-3 px-5 py-4 text-ticket-ink">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none tracking-wide">{glyphs.join(" ")}</p>
          <p className="mt-3 font-display text-4xl leading-none">{returnLabel}</p>
          <p className="mt-3 max-h-12 overflow-hidden text-sm leading-6 text-fg-muted">
            {heading}の きっぷ。つぎの とうちゃくは うえ。
          </p>
        </div>
        <TicketQrMark />
      </div>
      <footer className="flex h-8 items-center justify-between gap-3 overflow-hidden border-t border-primary/30 px-4 text-[11px] text-fg-subtle whitespace-nowrap">
        <span>{domain}</span>
        <span>{issueDay}</span>
      </footer>
    </article>
  );
}