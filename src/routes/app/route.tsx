import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isAllowedNext } from "@/lib/post-auth-redirect";
import { ADMIN_LOGIN_PATH, isAdminSurface } from "@/lib/admin-routes";
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
    // The console has its own door. A signed-out visit to /app/admin goes to
    // /admin/login?next=/app/admin -- not to the parent-facing /login, whose
    // sign-in hops through /onboard and asks for a child first.
    if (isAdminSurface(path)) return <RedirectToSignIn to={ADMIN_LOGIN_PATH} next={path} />;
    // Carry where they were trying to go through sign-in. Without this every
    // signed-out /app/* visit came back to /app, which funnels a childless
    // account into the register-a-child form -- so an admin following a link
    // to /app/admin could never actually arrive there. Allow-listed paths
    // only (see post-auth-redirect.ts); anything else falls back as before.
    return <RedirectToSignIn next={isAllowedNext(path) ? path : undefined} />;
  }
  return <Outlet />;
}
