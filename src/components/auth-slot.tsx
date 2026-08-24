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
        className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-md border border-border bg-surface px-3 text-sm font-medium sm:px-4"
      >
        {t("loginParent")}
      </Link>
    );
  }
  return <UserButton />;
}
