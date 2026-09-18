"use server";

import { requireUser } from "@/lib/auth";
import { computeNotifications, type NotificationItem } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function fetchNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  const user = await requireUser();
  const items = await computeNotifications(user);
  return { items, unread: items.filter((n) => !n.read).length };
}

export async function markNotificationRead(notifKey: string): Promise<void> {
  const user = await requireUser();
  await prisma.notificationRead.upsert({
    where: { userId_notifKey: { userId: user.id, notifKey } },
    update: {},
    create: { userId: user.id, notifKey },
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  const items = await computeNotifications(user);
  const unreadKeys = items.filter((n) => !n.read).map((n) => n.key);
  if (unreadKeys.length === 0) return;
  await prisma.notificationRead.createMany({
    data: unreadKeys.map((notifKey) => ({ userId: user.id, notifKey })),
    skipDuplicates: true,
  });
}
