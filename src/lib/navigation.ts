import {
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileOutput,
  FileText,
  Flag,
  IndianRupee,
  LayoutDashboard,
  ListOrdered,
  PackageCheck,
  Receipt,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
}

/**
 * Sidebar entries, strictly by role:
 * - INITIATOR: Dashboard, Requisitions (own section), GRN (own section)
 * - OC: as INITIATOR + Approvals (own section, incl. GRN countersign)
 * - ADM/DM: Dashboard, Approvals, Registers, read-only everything, Flags digest
 * - NDC: Dashboard, Procurement Queue, Supply Orders, Bills, Payments,
 *   Registers, Vendors (read)
 * - NEZARATH_CLERK: Supply Orders (draft), Bills (entry), Payments (entry)
 * - ADMIN: Sections & Users, Items, Vendors, Settings, Audit Log
 */
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["INITIATOR", "OC", "ADM", "DM", "NDC"] },
  { title: "Requisitions", href: "/requisitions", icon: FileText, roles: ["INITIATOR", "OC", "ADM", "DM"] },
  { title: "Approvals", href: "/approvals", icon: ClipboardCheck, roles: ["OC", "ADM", "DM"] },
  { title: "Procurement Queue", href: "/procurement-queue", icon: ListOrdered, roles: ["NEZARATH_CLERK", "NDC", "ADM", "DM"] },
  { title: "Supply Orders", href: "/supply-orders", icon: FileOutput, roles: ["NEZARATH_CLERK", "NDC", "ADM", "DM"] },
  { title: "GRN", href: "/grn", icon: PackageCheck, roles: ["INITIATOR", "OC", "ADM", "DM"] },
  { title: "Bills", href: "/bills", icon: Receipt, roles: ["NEZARATH_CLERK", "NDC", "ADM", "DM"] },
  { title: "Payments", href: "/payments", icon: IndianRupee, roles: ["NEZARATH_CLERK", "NDC", "ADM", "DM"] },
  { title: "Registers", href: "/registers", icon: BookOpen, roles: ["INITIATOR", "OC", "NDC", "ADM", "DM"] },
  { title: "Weekly Digest", href: "/digest", icon: CalendarDays, roles: ["ADM", "DM"] },
  { title: "Flags", href: "/flags", icon: Flag, roles: ["ADM", "DM"] },
  { title: "Vendors", href: "/vendors", icon: Building2, roles: ["NDC", "ADM", "DM", "ADMIN"] },
  { title: "Items", href: "/items", icon: Boxes, roles: ["ADMIN"] },
  { title: "Sections & Users", href: "/sections-users", icon: Users, roles: ["ADMIN"] },
  { title: "Settings", href: "/settings", icon: Settings, roles: ["ADMIN"] },
  { title: "Audit Log", href: "/audit-log", icon: ScrollText, roles: ["ADMIN"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** True when `role` may open the page at `href`. */
export function canViewRoute(role: Role, href: string): boolean {
  const item = NAV_ITEMS.find((i) => i.href === href);
  return item ? item.roles.includes(role) : false;
}
