import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ChildShell } from "@/components/child-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId } from "@/lib/active-child";
import { resolveInitialChildId } from "@/lib/child-route-resolve";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import { getAdminStatus } from "@/lib/server/admin";

export const Route = createFileRoute("/app/")({
  component: AppHome,
  validateSearch: gradeSearchFrom,
});

/**
 * /app is now a resolver, not a board. It answers one question -- whose
 * board? -- and forwards to /app/child/<id>, where the board actually lives.
 *
 * Resolution order, all of it client-side and none of it trusted:
 *   1. the device-local hint, IF it still names one of this household's
 *      living children (see child-route-resolve.ts)
 *   2. otherwise the first child by created_at
 *   3. no children at all -> /onboard, unless this is an admin account,
 *      which has no children and never will
 */
function AppHome() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });

  // Only consulted when this account has no child and would otherwise be
  // sent to onboarding -- an admin has no child and never will, so the
  // consumer gate below must not catch them. A normal family never triggers
  // this query at all.
  const childless = Boolean(childrenQ.data && childrenQ.data.length === 0);
  const adminQ = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => getAdminStatus(),
    enabled: childless,
    retry: false,
  });

  useEffect(() => {
    if (!childrenQ.data) return;
    const next = resolveInitialChildId(childrenQ.data, readActiveChildId());
    if (!next) {
      if (adminQ.isLoading) return; // decide once, rather than bouncing to /onboard first
      void navigate({ to: adminQ.data?.isAdmin ? "/app/admin" : "/onboard" });
      return;
    }
    void navigate({
      to: "/app/child/$childId",
      params: { childId: next },
      search: search.grade ? { grade: search.grade } : {},
      replace: true,
    });
  }, [childrenQ.data, navigate, adminQ.isLoading, adminQ.data, search.grade]);

  return (
    <ChildShell>
      <div className="mx-auto flex w-full max-w-[900px] flex-1 items-center px-4">
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </ChildShell>
  );
}
