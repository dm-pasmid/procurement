"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { navItemsForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({
  role,
  collapsed,
}: {
  role: Role;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <nav aria-label="Main navigation" className="flex flex-col gap-0.5 p-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.title}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
