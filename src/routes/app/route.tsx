import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-48 w-full rounded-[28px]" />
        </div>
      </AppShell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Outlet />;
}
