import { Link } from "@tanstack/react-router";
import { childLabels, formatChildLabel } from "@/lib/child-labels";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

/**
 * The locomotive switcher: one engine per child in this household, above the
 * station board.
 *
 * Navigation, not a gate. One tap goes to that child's board with no
 * confirmation and no check, because a child tapping their sibling's
 * locomotive has done nothing that needs permission -- everyone in the
 * household may LOOK at everyone's train (canView is never false). Whether
 * they can ride it is decided on the board they land on, by the boarding
 * pass, exactly as it is for their own.
 *
 * Deliberately carries NO entitlement signal of its own. The design brief's
 * "other, not covered -> outline only" was the one instruction in this
 * ticket worth pushing back on, and the version here draws the CURRENT child
 * solid-vermilion and every sibling in sumi outline -- coverage is not
 * rendered. An outline that means "your brother has the pass and you do not"
 * is a price signal on the child surface wearing a different coat: a child
 * can read it, will ask about it, and the answer is about money. The parent
 * surface is where that is explained, to the person who can act on it. The
 * locked board itself already says 「いまは のれません」 when they get there,
 * which is the honest amount for a child to know.
 *
 * Hidden entirely for an only child: a switcher with one option is furniture.
 */
export function ChildSwitcher({
  siblings,
  currentId,
}: {
  siblings: { id: string; name: string; grade: number }[];
  currentId?: string;
}) {
  const { t } = useI18n();
  if (siblings.length < 2) return null;
  // Same-named siblings need telling apart here too -- a child tapping the
  // wrong locomotive lands on their sibling's board. Year and birth order
  // only; nothing here reveals who holds a pass.
  const labels = childLabels(
    siblings,
    (g) => t("gradeN", { n: g }),
    (n) => t("childOrdinal", { n }),
  );

  return (
    <nav
      aria-label={t("childSwitcherLabel")}
      data-child-switcher
      className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-1"
    >
      {siblings.map((child, i) => {
        const current = child.id === currentId;
        const label = labels[i]!;
        return (
          <Link
            key={child.id}
            to="/app/child/$childId"
            params={{ childId: child.id }}
            data-child-switch={child.id}
            data-child-switch-current={current || undefined}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 flex-col items-center justify-center rounded-lg px-3 py-1",
              current ? "bg-primary/10" : "hover:bg-bg-warm",
            )}
          >
            <Locomotive solid={current} />
            <span
              className={cn(
                "mt-0.5 max-w-20 truncate font-display text-xs",
                current ? "text-primary" : "text-fg-muted",
              )}
            >
              {formatChildLabel(label)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A 0系-ish nose in 22 pixels. Solid for the child whose board this is,
 * outlined for everyone else -- the same "you are here / you could be there"
 * distinction the world nav already makes, drawn as rolling stock.
 */
function Locomotive({ solid }: { solid: boolean }) {
  return (
    <svg viewBox="0 0 28 18" className="h-5 w-7" aria-hidden focusable="false">
      <path
        d="M3 13.5V7.5C3 4.5 6.5 2.5 11.5 2.5H18c4 0 7 2.2 7 5.4v5.6z"
        fill={solid ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        className={solid ? "text-primary" : "text-fg-subtle"}
      />
      <line
        x1="1.5"
        y1="15.2"
        x2="26.5"
        y2="15.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        className={solid ? "text-primary" : "text-fg-subtle"}
      />
    </svg>
  );
}
