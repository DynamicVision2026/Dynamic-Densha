import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-surface px-3 text-base text-fg shadow-none outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
