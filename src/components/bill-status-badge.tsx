import type { BillStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_META: Record<BillStatus, { label: string; className: string }> = {
  ENTERED: { label: "Entered", className: "bg-muted text-muted-foreground" },
  MEMO_GENERATED: { label: "Memo generated", className: "bg-primary text-primary-foreground" },
  PART_PAID: { label: "Part paid", className: "bg-warning text-warning-foreground" },
  PAID: { label: "Paid", className: "bg-secondary text-secondary-foreground" },
};

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={cn("border-transparent", meta.className)}>
      {meta.label}
    </Badge>
  );
}
