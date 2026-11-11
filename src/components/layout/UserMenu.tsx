import Link from "next/link";
import { getCurrentAccess } from "@/lib/auth/session";
import { avatarUrl } from "@/lib/discord/snowflake";
import { UserMenuDropdown } from "@/components/layout/UserMenuDropdown";

export async function UserMenu() {
  const { user, access } = await getCurrentAccess();

  if (!user) {
    return (
      <Link href="/login" className="nv-btn nv-btn-ghost nv-btn-sm !py-2">
        Einloggen
      </Link>
    );
  }

  return (
    <UserMenuDropdown
      name={user.globalName || user.username}
      username={user.username}
      avatar={avatarUrl(user.discordId, user.avatar, 64)}
      isTeam={!!access?.isTeam}
      isAdmin={!!access?.isAdmin}
    />
  );
}
