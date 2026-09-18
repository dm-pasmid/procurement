import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileDown, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReqStatusBadge } from "@/components/req-status-badge";
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
import {
  ACK_TEXT,
  admActsForSection,
  isPendingApprover,
  pendingLevelFor,
} from "@/lib/approval-flow";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { computeSmartChecks } from "@/lib/smart-checks";
import { cn } from "@/lib/utils";
import { ApprovalCaseForm } from "../approval-case-form";

export const metadata: Metadata = { title: "Approval" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function ApprovalCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/approvals");

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
    },
  });
  if (!req) notFound();
  if (user.role === "OC" && req.sectionId !== user.sectionId) {
    redirect("/approvals");
  }

  const level = pendingLevelFor(req.status);
  let actsNow = isPendingApprover(user, req) && req.initiatorId !== user.id;
  if (actsNow && level === "ADM") {
    actsNow = await admActsForSection(user.id, req.sectionId);
  }
  const isOwn = req.initiatorId === user.id;

  // Smart Checks (creates WARN flags on first render)
  const checks = await computeSmartChecks(req.id);
  const admLimit = await getSettingNumber("ADM_LIMIT");

  // Section's last 12 months of requisitions for the same items
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const itemIds = req.items.flatMap((l) => (l.itemId ? [l.itemId] : []));
  const history =
    itemIds.length > 0
      ? await prisma.requisition.findMany({
          where: {
            sectionId: req.sectionId,
            id: { not: req.id },
            status: { notIn: ["DRAFT"] },
            createdAt: { gte: yearAgo },
            items: { some: { itemId: { in: itemIds } } },
          },
          include: {
            items: {
              where: { itemId: { in: itemIds } },
              include: { item: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
      : [];

  return (
    <>
      <PageHeader
        title={`Approval — ${req.reqNumber}`}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Approvals", href: "/approvals" },
          { label: req.reqNumber },
        ]}
        action={
          <Button asChild variant="outline">
            <a href={`/requisitions/${req.id}/pdf`} target="_blank" rel="noreferrer">
              <FileDown /> PDF
            </a>
          </Button>
        }
      />

      {/* Statutory splitting banner */}
      {checks.splittingBanner && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-md border-2 border-critical bg-critical/10 p-4"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-critical" />
          <p className="text-sm font-semibold text-critical">
            {checks.splittingBanner}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Case summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                <ReqStatusBadge status={req.status} />
                <span className="text-sm font-normal text-muted-foreground">
                  FY {req.fy} · {req.section.name} · Initiated by{" "}
                  {req.initiator.name} ({req.initiator.designation})
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
                  <p className="font-medium">
                    {req.finalLevel}
                    {req.routedToDmReason && (
                      <span className="block text-xs font-normal text-critical">
                        {req.routedToDmReason}
                      </span>
                    )}
                  </p>
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

          {/* Items — pending approver may revise quantities (with action bar) */}
          <ApprovalCaseForm
            requisitionId={req.id}
            level={level}
            canAct={actsNow}
            requiresAck={checks.unacknowledgedFlags.length > 0}
            ackText={ACK_TEXT}
            openFlagCount={checks.unacknowledgedFlags.length}
            admLimit={admLimit}
            splittingForced={!!req.routedToDmReason}
            lines={req.items.map((line) => ({
              id: line.id,
              label: line.item?.name ?? line.itemNameFree ?? "item",
              nonMaster: !line.item,
              specification: line.specification,
              unit: line.unit,
              qty: Number(line.qty),
              estRate: Number(line.estRate),
            }))}
          />

          {/* 12-month same-item history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {req.section.name} — last 12 months, same items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other requisitions for these items in the last 12 months.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Matching items</TableHead>
                        <TableHead className="text-right">Estimate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>
                            <Link
                              href={`/requisitions/${h.id}`}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                            >
                              {h.reqNumber.startsWith("DRAFT-")
                                ? "Draft"
                                : h.reqNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {h.items
                              .map(
                                (l) =>
                                  `${l.item?.name ?? l.itemNameFree} × ${Number(l.qty)}`,
                              )
                              .join(", ")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {inr.format(Number(h.estimatedTotal))}
                          </TableCell>
                          <TableCell>
                            <ReqStatusBadge status={h.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {h.createdAt.toLocaleDateString("en-IN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prior approval actions */}
          {req.approvalActions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approval history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {req.approvalActions.map((a) => (
                  <p key={a.id} className="text-sm">
                    <span className="font-medium">{a.level}</span> —{" "}
                    {a.action.toLowerCase()} by {a.actor.name} on{" "}
                    {a.createdAt.toLocaleString("en-IN")}
                    {a.remarks && (
                      <span className="block text-xs italic text-muted-foreground">
                        “{a.remarks}”
                      </span>
                    )}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Status note when the viewer cannot act */}
          {!actsNow && (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {isOwn
                ? "You initiated this requisition — an approver never acts on their own requisition."
                : level
                  ? `This case is pending at ${level} level.`
                  : "This case is not awaiting approval."}
            </p>
          )}
        </div>

        {/* Smart Checks panel */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Smart Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks.rows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2.5 text-sm",
                  row.severity === "OK" &&
                    "border-green-600/40 bg-green-50 text-green-800",
                  row.severity === "INFO" && "bg-muted/60",
                  row.severity === "WARN" &&
                    "border-warning bg-warning/10",
                  row.severity === "CRITICAL" &&
                    "border-critical bg-critical/10",
                )}
              >
                {row.severity === "OK" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700" />
                ) : row.severity === "CRITICAL" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" />
                ) : row.severity === "WARN" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.category}
                  </p>
                  <p>{row.message}</p>
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Suggestive only — nothing here blocks approval. Approving with
              open flags records your acknowledgement on each flag.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
