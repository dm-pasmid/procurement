import type { Role } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";

/**
 * Server-side authorization. Every server action must call can() —
 * hiding UI is never the enforcement layer. Mirrored in Postgres RLS.
 */

export type Action =
  | "view"
  | "create"
  | "update"
  | "approve"
  | "countersign"
  | "acknowledge"
  | "manage"; // full master-data CRUD

export type Resource =
  | "dashboard"
  | "requisition"
  | "approval"
  | "procurement"
  | "supplyOrder"
  | "grn"
  | "bill"
  | "payment"
  | "register"
  | "vendor"
  | "item"
  | "user"
  | "section"
  | "setting"
  | "auditLog"
  | "flag";

/** Resources whose reads are scoped to the user's own section. */
const SECTION_SCOPED: Resource[] = ["requisition", "grn"];

const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  INITIATOR: {
    dashboard: ["view"],
    requisition: ["view", "create", "update"], // own section
    grn: ["view", "create", "update"], // own section
    register: ["view"], // own section
    item: ["view"],
    vendor: ["view"],
  },
  OC: {
    dashboard: ["view"],
    requisition: ["view", "create", "update"], // own section
    approval: ["view", "approve"], // own section, OC level
    grn: ["view", "create", "update", "countersign"], // own section
    register: ["view"], // own section
    item: ["view"],
    vendor: ["view"],
  },
  ADM: {
    dashboard: ["view"],
    requisition: ["view"],
    approval: ["view", "approve"],
    procurement: ["view"],
    supplyOrder: ["view"],
    grn: ["view"],
    bill: ["view"],
    payment: ["view"],
    register: ["view"],
    vendor: ["view"],
    item: ["view"],
    flag: ["view", "acknowledge"],
  },
  DM: {
    dashboard: ["view"],
    requisition: ["view"],
    approval: ["view", "approve"],
    procurement: ["view"],
    supplyOrder: ["view"],
    grn: ["view"],
    bill: ["view"],
    payment: ["view"],
    register: ["view"],
    vendor: ["view"],
    item: ["view"],
    flag: ["view", "acknowledge"],
  },
  NDC: {
    dashboard: ["view"],
    requisition: ["view"],
    grn: ["view"],
    procurement: ["view", "create", "update"],
    supplyOrder: ["view", "create", "update"],
    bill: ["view", "update"],
    payment: ["view", "create"],
    register: ["view"],
    vendor: ["view"],
    item: ["view"],
  },
  NEZARATH_CLERK: {
    procurement: ["view", "create", "update"], // drafts only — NDC confirms
    supplyOrder: ["view", "create", "update"], // drafts
    bill: ["view", "create", "update"], // entry; NDC generates the memo
    payment: ["view", "create"],
    vendor: ["view"],
    item: ["view"],
  },
  ADMIN: {
    user: ["view", "manage"],
    section: ["view", "manage"],
    item: ["view", "manage"],
    vendor: ["view", "manage"],
    setting: ["view", "manage"],
    auditLog: ["view"],
  },
};

export function can(
  user: Pick<CurrentUser, "role" | "sectionId" | "active">,
  action: Action,
  resource: Resource,
  opts?: { sectionId?: string },
): boolean {
  if (!user.active) return false;

  const allowed = MATRIX[user.role]?.[resource];
  if (!allowed?.includes(action)) return false;

  // Section scoping: INITIATOR and OC only reach their own section's records.
  if (
    (user.role === "INITIATOR" || user.role === "OC") &&
    SECTION_SCOPED.includes(resource) &&
    opts?.sectionId !== undefined &&
    opts.sectionId !== user.sectionId
  ) {
    return false;
  }

  return true;
}

/** Throwing guard for server actions. */
export function assertCan(
  user: Pick<CurrentUser, "role" | "sectionId" | "active">,
  action: Action,
  resource: Resource,
  opts?: { sectionId?: string },
): void {
  if (!can(user, action, resource, opts)) {
    throw new Error("Not authorised");
  }
}

/** Landing route after login, per role. */
export function homeRoute(role: Role): string {
  switch (role) {
    case "NEZARATH_CLERK":
      return "/supply-orders";
    case "ADMIN":
      return "/sections-users";
    default:
      return "/dashboard";
  }
}
