import { useQuery } from "@tanstack/react-query";
import { readActiveChildId } from "@/lib/active-child";
import { resolveInitialChildId } from "@/lib/child-route-resolve";
import { listChildren } from "@/lib/server/children";

/**
 * Which child a path that does not name one should resolve to.
 *
 * Used by /app and by the pre-scoping paths (/app/catalog and friends), which
 * are kept as redirects rather than deleted: those URLs are in browser
 * histories, in home-screen shortcuts, and in at least one confirmation
 * email. Answering them with a 404 because the app's route shape changed
 * would be the app's problem presented as the family's.
 *
 * `undefined` while the children list is still loading -- distinct from
 * `null`, which means this household genuinely has none and the caller
 * should send them to /onboard.
 */
export function useResolvedChildId(): string | null | undefined {
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  if (!childrenQ.data) return undefined;
  return resolveInitialChildId(childrenQ.data, readActiveChildId());
}
