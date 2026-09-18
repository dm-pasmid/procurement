"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { AppFooter } from "./app-footer";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export interface ShellUser {
  name: string;
  designation: string;
  role: Role;
  sectionName: string;
}

export function AppShell({
  user,
  notifUnread,
  children,
}: {
  user: ShellUser;
  notifUnread: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar user={user} notifUnread={notifUnread} onToggleSidebar={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1">
        <Sidebar role={user.role} collapsed={collapsed} />
        <main className="min-w-0 flex-1 bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
      <AppFooter />
    </div>
  );
}
