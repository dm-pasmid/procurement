"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/notifications-actions";
import type { NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const { items, unread } = await fetchNotifications();
    setItems(items);
    setUnread(unread);
    setLoaded(true);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openItem(n: NotificationItem) {
    startTransition(async () => {
      await markNotificationRead(n.key);
      setOpen(false);
      router.push(n.href);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    });
  }

  const dmy = (d: Date) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" aria-label="Notifications" onClick={toggle} className="relative">
        <Bell />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-critical text-[10px] font-semibold text-critical-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-[28rem] w-80 overflow-auto rounded-md border bg-popover shadow-md">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Check className="size-3" /> Mark all read
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing needs your attention.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.key}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full gap-2 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-accent hover:text-accent-foreground",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    {!n.read && <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className={cn("flex-1", n.read && "pl-3.5")}>
                      {n.title}
                      <span className="mt-0.5 block text-xs text-muted-foreground">{dmy(n.at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
