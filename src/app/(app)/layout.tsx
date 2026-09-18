import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { unreadNotificationCount } from "@/lib/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const notifUnread = await unreadNotificationCount(user);

  return (
    <AppShell
      user={{
        name: user.name,
        designation: user.designation,
        role: user.role,
        sectionName: user.sectionName,
      }}
      notifUnread={notifUnread}
    >
      {children}
    </AppShell>
  );
}
