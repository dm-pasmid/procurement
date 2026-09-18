import type { SoStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_META: Record<SoStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ISSUED: { label: "Issued", className: "bg-primary text-primary-foreground" },
  AMENDED: { label: "Amended", className: "bg-warning text-warning-foreground" },
  CANCELLED: { label: "Cancelled", className: "bg-critical text-critical-foreground" },
  CLOSED: { label: "Closed", className: "bg-muted text-muted-foreground" },
  SHORT_CLOSED: { label: "Short closed", className: "bg-warning text-warning-foreground" },
};

export function SoStatusBadge({ status }: { status: SoStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={cn("border-transparent", meta.className)}>
      {meta.label}
    </Badge>
  );
}

/** Delivery countdown chip for an issued SO. */
export function DeliveryCountdown({
  issuedAt,
  deliveryDays,
  received = false,
}: {
  issuedAt: Date;
  deliveryDays: number;
  received?: boolean;
}) {
  if (received) return <Badge variant="secondary">Delivered</Badge>;
  const due = issuedAt.getTime() + deliveryDays * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft < 0) {
    return (
      <Badge className="border-transparent bg-critical text-critical-foreground">
        overdue by {-daysLeft} day{daysLeft === -1 ? "" : "s"}
      </Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "border-transparent",
        daysLeft <= 2
          ? "bg-warning text-warning-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      due in {daysLeft} day{daysLeft === 1 ? "" : "s"}
    </Badge>
  );
}
