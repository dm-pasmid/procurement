import type { FlagType } from "@prisma/client";

/** Client-safe flag display helpers. */

export const FLAG_TYPE_LABELS: Record<FlagType, string> = {
  SPLITTING_SUSPECT: "Splitting suspect",
  PRICE_DEVIATION: "Price deviation",
  QTY_ANOMALY: "Quantity anomaly",
  FREQUENCY_ANOMALY: "Frequency anomaly",
  DUPLICATE_SUSPECT: "Duplicate suspect",
  ESTIMATE_EXCEEDED: "Estimate exceeded",
  DELIVERY_OVERDUE: "Delivery overdue",
  APPROVAL_SLA: "SLA breach",
  GRN_NO_BILL: "GRN without bill",
  BILL_UNPAID: "Bill unpaid",
};

/** Best human-readable line from a flag's details JSON. */
export function flagNote(details: unknown): string {
  if (details && typeof details === "object") {
    const d = details as Record<string, unknown>;
    if (typeof d.note === "string") return d.note;
    if (typeof d.bannerText === "string") return d.bannerText;
    if (Array.isArray(d.messages) && d.messages.length > 0) {
      return d.messages.filter((m) => typeof m === "string").join("; ");
    }
  }
  return "—";
}

/** Route to the flagged record, by entity type. */
export function flagEntityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "Requisition":
      return `/requisitions/${entityId}`;
    case "SupplyOrder":
      return `/supply-orders/${entityId}`;
    case "Grn":
      return `/grn/${entityId}`;
    case "Bill":
      return `/bills/${entityId}`;
    default:
      return null;
  }
}
