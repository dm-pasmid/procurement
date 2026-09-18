"use client";

import { LogOut, PanelLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import type { ShellUser } from "./app-shell";

export function TopBar({
  user,
  notifUnread,
  onToggleSidebar,
}: {
  user: ShellUser;
  notifUnread: number;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b-2 border-primary bg-background px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <PanelLeft />
        </Button>
        <div
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center border-2 border-primary text-[9px] font-semibold tracking-wide text-primary"
        >
          EMBLEM
        </div>
      </div>

      <div className="min-w-0 flex-1 text-center lg:hidden">
        <p className="truncate text-sm font-semibold text-primary">
          Office of the District Magistrate &amp; Collector, Paschim Medinipur
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Procurement Management System (PMS)
        </p>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col items-center lg:flex">
        <p className="truncate text-sm font-semibold text-primary">
          Office of the District Magistrate &amp; Collector, Paschim Medinipur
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Procurement Management System (PMS)
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <GlobalSearch />
        <NotificationBell initialUnread={notifUnread} />
        <div className="hidden text-right md:block">
          <p className="text-sm font-medium leading-tight">{user.name}</p>
          <p className="text-xs leading-tight text-muted-foreground">
            {user.designation} &middot; {user.sectionName}
          </p>
        </div>
        <Badge>{user.role}</Badge>
        <form action="/auth/signout" method="post">
          <Button variant="outline" size="sm" type="submit">
            <LogOut aria-hidden />
            Logout
          </Button>
        </form>
      </div>
    </header>
  );
}
