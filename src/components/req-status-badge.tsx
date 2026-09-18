import type { ReqStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_META: Record<ReqStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  SUBMITTED: { label: "Submitted", className: "bg-secondary text-secondary-foreground" },
  OC_APPROVED: { label: "OC approved", className: "bg-secondary text-secondary-foreground" },
  ADM_APPROVED: { label: "ADM approved", className: "bg-secondary text-secondary-foreground" },
  APPROVED: { label: "Approved", className: "bg-primary text-primary-foreground" },
  RETURNED: { label: "Returned", className: "bg-warning text-warning-foreground" },
  REJECTED: { label: "Rejected", className: "bg-critical text-critical-foreground" },
  IN_PROCUREMENT: { label: "In procurement", className: "bg-secondary text-secondary-foreground" },
  SO_ISSUED: { label: "SO issued", className: "bg-secondary text-secondary-foreground" },
  PARTIALLY_RECEIVED: { label: "Partially received", className: "bg-secondary text-secondary-foreground" },
  RECEIVED: { label: "Received", className: "bg-secondary text-secondary-foreground" },
  BILL_UNDER_PROCESS: { label: "Bill under process", className: "bg-secondary text-secondary-foreground" },
  CLOSED: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

export function ReqStatusBadge({ status }: { status: ReqStatus }) {
  const meta = STATUS_META[status];
  return <Badge className={cn("border-transparent", meta.className)}>{meta.label}</Badge>;
}

export const REQ_STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.label]),
) as Record<ReqStatus, string>;
