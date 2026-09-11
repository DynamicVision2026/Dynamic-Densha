import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isAllowedNext } from "@/lib/post-auth-redirect";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildShell } from "@/components/child-shell";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (isPending) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center px-4">
          <Skeleton className="h-48 w-full max-w-[900px] rounded-[28px]" />
        </div>
      </ChildShell>
    );
  }
  if (!user) {
    // Carry where they were trying to go through sign-in. Without this every
    // signed-out /app/* visit came back to /app, which funnels a childless
    // account into the register-a-child form -- so an admin following a link
    // to /app/admin could never actually arrive there. Allow-listed paths
    // only (see post-auth-redirect.ts); anything else falls back as before.
    return <RedirectToSignIn next={isAllowedNext(path) ? path : undefined} />;
  }
  return <Outlet />;
}
