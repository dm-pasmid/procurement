import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
import { GRN_DECLARATION } from "@/lib/grn-constants";
import { GrnDetailActions } from "./grn-detail-actions";

export const metadata: Metadata = { title: "GRN" };

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/grn");

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      so: {
        include: {
          vendor: true,
          deliverySection: true,
          items: true,
          requisition: true,
        },
      },
      items: true,
      receiver: true,
      ocCountersignedBy: true,
    },
  });
  if (!grn) notFound();
  if (!can(user, "view", "grn", { sectionId: grn.so.deliverySectionId })) {
    redirect("/grn");
  }

  const isDraftNumber = grn.grnNumber.startsWith("DRAFT-");
  const label = isDraftNumber ? "Draft GRN" : grn.grnNumber;
  const soLineById = new Map(grn.so.items.map((l) => [l.id, l]));

  const isOcOfSection =
    user.role === "OC" && user.sectionId === grn.so.deliverySectionId;
  const canEdit =
    grn.status === "DRAFT" &&
    can(user, "update", "grn", { sectionId: grn.so.deliverySectionId });

  // Reopen history lives in the append-only audit trail — shown for ever.
  const reopenLogs = await prisma.auditLog.findMany({
    where: { entityType: "Grn", entityId: grn.id, action: "REOPEN" },
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  });

  const attachments = await prisma.attachment.findMany({
    where: { entityType: "Grn", entityId: grn.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        title={label}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "GRN", href: "/grn" },
          { label: isDraftNumber ? "Draft" : grn.grnNumber },
        ]}
        action={
          <div className="flex gap-2">
            {grn.status === "COUNTERSIGNED" && (
              <Button asChild variant="outline">
                <a href={`/grn/${grn.id}/pdf`} target="_blank" rel="noreferrer">
                  <FileDown /> PDF
                </a>
              </Button>
            )}
            {canEdit && (
              <Button asChild>
                <Link href={`/grn/${grn.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Reopen reasons stay on the GRN for ever */}
      {reopenLogs.length > 0 && (
        <div className="mb-4 space-y-2">
          {reopenLogs.map((log) => {
            const after = log.after as { reason?: string } | null;
            return (
              <div
                key={log.id}
                className="rounded-md border-2 border-warning bg-warning/10 p-3 text-sm"
              >
                <span className="font-semibold">
                  Reopened on {log.createdAt.toLocaleDateString("en-IN")} by{" "}
                  {log.actor?.name ?? "—"}:
                </span>{" "}
                {after?.reason ?? "—"}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              {grn.status === "COUNTERSIGNED" ? (
                <Badge className="border-transparent bg-primary text-primary-foreground">
                  Countersigned
                </Badge>
              ) : (
                <Badge className="border-transparent bg-warning text-warning-foreground">
                  Draft — awaiting OC countersignature
                </Badge>
              )}
              <span className="text-sm font-normal text-muted-foreground">
                Against{" "}
                <Link
                  href={`/supply-orders/${grn.soId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {grn.so.soNumber}
                </Link>{" "}
                · {grn.so.vendor.name} · {grn.so.deliverySection.name}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Receipt date</p>
              <p>{grn.receiptDate.toLocaleDateString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Challan</p>
              <p>
                {grn.challanNumber} · {grn.challanDate.toLocaleDateString("en-IN")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Received by</p>
              <p>{grn.receiver.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Countersigned</p>
              <p>
                {grn.ocCountersignedAt
                  ? `${grn.ocCountersignedAt.toLocaleDateString("en-IN")} by ${grn.ocCountersignedBy?.name ?? "—"}`
                  : "Pending"}
              </p>
            </div>
            {grn.remarks && (
              <div className="md:col-span-4">
                <p className="text-xs font-medium text-muted-foreground">Remarks</p>
                <p>{grn.remarks}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grn.items.map((line) => {
                    const soLine = soLineById.get(line.soItemId);
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {soLine?.description ?? "—"}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {soLine?.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {soLine ? Number(soLine.qty) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(line.qtyReceived)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(line.qtyAccepted)}
                        </TableCell>
                        <TableCell
                          className={
                            Number(line.qtyRejected) > 0
                              ? "text-right font-medium tabular-nums text-critical"
                              : "text-right tabular-nums"
                          }
                        >
                          {Number(line.qtyRejected)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.remarks ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <GrnDetailActions
          grnId={grn.id}
          status={grn.status}
          isOcOfSection={isOcOfSection}
          canEdit={canEdit}
          declaration={GRN_DECLARATION}
          attachments={attachments.map((a) => ({
            id: a.id,
            label: a.label,
            createdAt: a.createdAt.toLocaleDateString("en-IN"),
          }))}
        />
      </div>
    </>
  );
}
