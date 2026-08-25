import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Child surface: 100dvh app shell, outer never scrolls, 900px center on desktop. */
export function ChildShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-child-shell
      className={cn(
        "paper-wash relative flex h-dvh max-h-dvh flex-col overflow-hidden overscroll-none",
        "fixed inset-0",
        className,
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[900px] flex-col">{children}</div>
    </div>
  );
}
