import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useI18n } from "@/lib/i18n/i18n";
import { Link } from "@tanstack/react-router";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  if (isPending) {
    return <div className="h-11 w-28 animate-pulse rounded-full bg-bg-warm" />;
  }
  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex min-h-11 shrink-0 items-center whitespace-normal rounded-md border border-border bg-surface px-2 py-1 text-center text-xs font-medium leading-tight sm:h-11 sm:whitespace-nowrap sm:px-4 sm:text-sm"
      >
        {t("loginParent")}
      </Link>
    );
  }
  return <UserButton />;
}
