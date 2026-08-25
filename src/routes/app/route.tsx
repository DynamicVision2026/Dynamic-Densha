import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { ChildShell } from "@/components/child-shell";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center px-4">
          <Skeleton className="h-48 w-full max-w-[900px] rounded-[28px]" />
        </div>
      </ChildShell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Outlet />;
}
