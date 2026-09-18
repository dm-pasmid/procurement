import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReqStatusBadge } from "@/components/req-status-badge";
import { Timeline, type TimelineEvent } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Requisition" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const BASIS_LABELS: Record<string, string> = {
  LAST_PURCHASE_RATE: "Last Purchase Rate",
  MARKET_SURVEY: "Market Survey",
  GEM: "GeM",
  RATE_CONTRACT: "Rate Contract",
  OTHER: "Other",
};

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/requisitions");

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      section: true,
      initiator: true,
      items: { include: { item: true } },
      approvalActions: {
        include: { actor: true },
        orderBy: { createdAt: "asc" },
      },
      procurement: { include: { vendor: true, createdBy: true } },
      supplyOrders: {
        include: {
          vendor: true,
          grns: { include: { receiver: true } },
          bills: { include: { payments: true } },
        },
        orderBy: { soNumber: "asc" },
      },
    },
  });
  if (!req) notFound();
  if (!can(user, "view", "requisition", { sectionId: req.sectionId })) {
    redirect("/requisitions");
  }
  // Drafts stay inside their own section, whatever the viewer's role.
  if (
    req.status === "DRAFT" &&
    (user.role === "ADM" || user.role === "DM") &&
    req.sectionId !== user.sectionId
  ) {
    redirect("/requisitions");
  }

  const isDraftNumber = req.reqNumber.startsWith("DRAFT-");
  const label = isDraftNumber ? "Draft requisition" : req.reqNumber;
  const editable =
    (req.status === "DRAFT" || req.status === "RETURNED") &&
    can(user, "update", "requisition", { sectionId: req.sectionId });

  // ---- timeline (later phases extend with procurement/SO/GRN/bill/payment) ----
  const events: TimelineEvent[] = [
    {
      id: "created",
      title: "Created",
      subtitle: `${req.initiator.name} · ${req.section.name}`,
      date: req.createdAt,
    },
  ];
  const submitLog = await prisma.auditLog.findFirst({
    where: { entityType: "Requisition", entityId: id, action: "SUBMIT" },
    orderBy: { createdAt: "desc" },
  });
  if (submitLog) {
    events.push({
      id: "submitted",
      title: "Submitted for approval",
      subtitle: `Final level: ${req.finalLevel}`,
      date: submitLog.createdAt,
    });
  }
  for (const action of req.approvalActions) {
    events.push({
      id: action.id,
      title: `${action.level}: ${action.action === "APPROVE" ? "Approved" : action.action === "RETURN" ? "Returned" : "Rejected"}`,
      subtitle: action.actor.name,
      remarks: action.remarks ?? undefined,
      date: action.createdAt,
      tone:
        action.action === "APPROVE"
          ? "success"
          : action.action === "RETURN"
            ? "warning"
            : "danger",
    });
  }
  if (req.procurement) {
    events.push({
      id: "procurement",
      title: `Procurement recorded (${req.procurement.mode})`,
      subtitle: `${req.procurement.vendor.name} · ${req.procurement.createdBy.name}`,
      date: req.procurement.createdAt,
    });
  }
  for (const so of req.supplyOrders) {
    events.push({
      id: so.id,
      title: `Supply order ${so.soNumber}`,
      subtitle: so.vendor.name,
      date: so.issuedAt,
    });
    for (const grn of so.grns) {
      events.push({
        id: grn.id,
        title: `GRN ${grn.grnNumber}`,
        subtitle: grn.receiver.name,
        date: grn.receiptDate,
      });
    }
    for (const bill of so.bills) {
      events.push({
        id: bill.id,
        title: `Bill ${bill.bpmNumber}`,
        date: bill.createdAt,
      });
      for (const payment of bill.payments) {
        events.push({
          id: payment.id,
          title: `Payment voucher ${payment.voucherNumber}`,
          date: payment.voucherDate,
        });
      }
    }
  }
  const pendingTitles: Partial<Record<typeof req.status, string>> = {
    DRAFT: "Pending: submission",
    RETURNED: "Pending: revision and resubmission",
    SUBMITTED: "Pending: OC approval",
    OC_APPROVED: "Pending: ADM approval",
    ADM_APPROVED: "Pending: DM approval",
    APPROVED: "Pending: procurement",
    IN_PROCUREMENT: "Pending: supply order",
    SO_ISSUED: "Pending: goods receipt",
    PARTIALLY_RECEIVED: "Pending: remaining delivery",
    RECEIVED: "Pending: bill",
  };
  const pendingTitle = pendingTitles[req.status];
  if (pendingTitle) {
    events.push({ id: "pending", title: pendingTitle, tone: "pending" });
  }

  return (
    <>
      <PageHeader
        title={label}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Requisitions", href: "/requisitions" },
          { label: isDraftNumber ? "Draft" : req.reqNumber },
        ]}
        action={
          <div className="flex gap-2">
            {!isDraftNumber && (
              <Button asChild variant="outline">
                <a
                  href={`/requisitions/${req.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileDown /> PDF
                </a>
              </Button>
            )}
            {editable && (
              <Button asChild>
                <Link href={`/requisitions/${req.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                <ReqStatusBadge status={req.status} />
                <span className="text-sm font-normal text-muted-foreground">
                  FY {req.fy} · {req.section.name} · Initiated by{" "}
                  {req.initiator.name}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Purpose / justification
                </p>
                <p className="text-sm">{req.purpose}</p>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Total estimate
                  </p>
                  <p className="font-semibold tabular-nums text-primary">
                    {inr.format(Number(req.estimatedTotal))}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Final approval level
                  </p>
                  <p className="font-medium">{req.finalLevel}</p>
                </div>
                {req.desiredDeliveryDays != null && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Desired delivery
                    </p>
                    <p>{req.desiredDeliveryDays} days</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Item-wise estimate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Sl</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Specification</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Est. rate</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {req.items.map((line, i) => (
                      <TableRow key={line.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {line.item?.name ?? line.itemNameFree}
                          {!line.item && (
                            <Badge className="ml-2 bg-warning text-warning-foreground">
                              non-master
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                          {line.specification ?? "—"}
                        </TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(line.qty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inr.format(Number(line.estRate))}
                        </TableCell>
                        <TableCell className="text-sm">
                          {BASIS_LABELS[line.estBasis]}
                          {line.basisRemarks ? (
                            <span className="block text-xs text-muted-foreground">
                              {line.basisRemarks}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr.format(Number(line.qty) * Number(line.estRate))}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={7} className="text-right font-medium">
                        Total estimate
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-primary">
                        {inr.format(Number(req.estimatedTotal))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline events={events} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
