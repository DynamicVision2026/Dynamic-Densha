import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ChildShell } from "@/components/child-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { writeActiveChildId } from "@/lib/active-child";
import { listChildren } from "@/lib/server/children";

export const Route = createFileRoute("/app/child/$childId")({
  component: ChildLayout,
});

/**
 * Every child-facing surface now lives under this route, and the child it is
 * about is in the PATH rather than in localStorage.
 *
 * That is the whole point of the move. The old arrangement kept one "active
 * child" in browser storage and every surface read it, which meant two
 * siblings could not be open in two tabs, a link sent from one device opened
 * whoever the receiving device last used, and a stale hint silently
 * redirected a parent to the wrong child's progress. A child id in the URL
 * is shareable, bookmarkable, and unambiguous.
 *
 * This layout's only job is to make sure the id in the path is one of the
 * caller's own living children, and to bounce back to /app (which re-picks
 * one) if it is not. It deliberately does NOT check entitlement: a child who
 * cannot ride can still see their train (canView is never false), and the
 * boarding pass on the board is what refuses. Bouncing them out of their own
 * board would be exactly the "nothing here for you" screen this product does
 * not have.
 */
function ChildLayout() {
  const { childId } = Route.useParams();
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });

  // The hint follows the URL, never the other way round -- so arriving by
  // link, by switcher, or by back button all leave the same trace, and the
  // next bare /app visit lands where this one did.
  const known = Boolean(childrenQ.data?.some((c) => c.id === childId));
  useEffect(() => {
    if (known) writeActiveChildId(childId);
  }, [known, childId]);

  if (childrenQ.isLoading || !childrenQ.data) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center px-4">
          <Skeleton className="h-48 w-full max-w-[900px] rounded-[28px]" />
        </div>
      </ChildShell>
    );
  }

  // Not one of ours: an archived child, a child from an account that used to
  // be signed in on this browser, or a guessed id. /app re-resolves rather
  // than showing a 404 -- from a family's point of view the useful answer to
  // "that child isn't here" is their own board, not an error page. The
  // server refuses the id independently on every request either way (see
  // src/lib/server/coverage.ts), so this redirect is ergonomics, not a gate.
  if (!known) return <Navigate to="/app" replace />;

  return <Outlet />;
}
