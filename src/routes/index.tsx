import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ChildShell } from "@/components/child-shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center text-sm text-fg-muted">漢字でんしゃ</div>
      </ChildShell>
    );
  }
  if (user && !user.isDevFallback) return <Navigate to="/app" />;
  return <Navigate to="/demo" />;
}
