import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileDown, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DeliveryCountdown, SoStatusBadge } from "@/components/so-status-badge";
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
import { soLineTotal, soTotal } from "@/lib/so-utils";
import { SoLifecycleActions } from "./so-lifecycle-actions";

export const metadata: Metadata = { title: "Supply order" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function SoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/supply-orders");

  const so = await prisma.supplyOrder.findUnique({
    where: { id },
    include: {
      items: true,
      vendor: true,
      deliverySection: true,
      requisition: { include: { section: true } },
      procurement: true,
      issuedBy: true,
      parentSo: true,
      amendments: { orderBy: { version: "asc" } },
      grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
      bills: true,
    },
  });
  if (!so) notFound();

  const canCloseCase =
    (so.status === "CLOSED" || so.status === "SHORT_CLOSED") &&
    so.bills.length > 0 &&
    so.bills.every((b) => b.status === "PAID") &&
    so.requisition.status !== "CLOSED";

  const receivedFor = (soItemId: string) =>
    so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === soItemId)
          .reduce((s, g) => s + Number(g.qtyReceived), 0),
      0,
    );
  const hasUndeliveredBalance = so.items.some(
    (line) => receivedFor(line.id) < Number(line.qty) - 1e-9,
  );

  const isDraftNumber = so.soNumber.startsWith("DRAFT-");
  const label = isDraftNumber ? `Draft SO (v${so.version})` : so.soNumber;
  const total = soTotal(
    so.items.map((l) => ({
      qty: Number(l.qty),
      rate: Number(l.rate),
      gstPercent: Number(l.gstPercent),
    })),
  );
  // The amendment that superseded this SO (issued, possibly itself amended later).
  const supersededBy =
    so.amendments.find((a) => a.status !== "DRAFT" && a.status !== "CANCELLED") ??
    so.amendments[0];

  return (
    <>
      <PageHeader
        title={label}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Supply Orders", href: "/supply-orders" },
          { label: isDraftNumber ? "Draft" : so.soNumber },
        ]}
        action={
          <div className="flex gap-2">
            {!isDraftNumber && (
              <Button asChild variant="outline">
                <a href={`/supply-orders/${so.id}/pdf`} target="_blank" rel="noreferrer">
                  <FileDown /> PDF
                </a>
              </Button>
            )}
            {so.status === "DRAFT" && can(user, "update", "supplyOrder") && (
              <Button asChild>
                <Link href={`/supply-orders/${so.id}/edit`}>
                  <Pencil /> Edit draft
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {so.status === "AMENDED" && supersededBy && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-3 rounded-md border-2 border-warning bg-warning/10 p-3"
        >
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <p className="text-sm font-semibold">
            AMENDED — superseded by version {supersededBy.version}
            {": "}
            <Link
              href={`/supply-orders/${supersededBy.id}`}
              className="underline underline-offset-2"
            >
              {supersededBy.soNumber.startsWith("DRAFT-")
                ? "draft"
                : supersededBy.soNumber}
            </Link>
          </p>
        </div>
      )}
      {so.status === "CANCELLED" && (
        <div
          role="alert"
          className="mb-4 rounded-md border-2 border-critical bg-critical/10 p-3 text-sm"
        >
          <span className="font-semibold text-critical">CANCELLED</span>
          {so.shortCloseReason && <> — {so.shortCloseReason}</>}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <SoStatusBadge status={so.status} />
              {so.status === "ISSUED" && so.issuedAt && (
                <DeliveryCountdown
                  issuedAt={so.issuedAt}
                  deliveryDays={so.deliveryDays}
                  received={so.grns.length > 0}
                />
              )}
              <span className="text-sm font-normal text-muted-foreground">
                Against{" "}
                <Link
                  href={`/requisitions/${so.requisitionId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {so.requisition.reqNumber}
                </Link>{" "}
                · {so.requisition.section.name}
                {so.parentSo && (
                  <>
                    {" "}
                    · amends{" "}
                    <Link
                      href={`/supply-orders/${so.parentSo.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {so.parentSo.soNumber.startsWith("DRAFT-")
                        ? "draft"
                        : so.parentSo.soNumber}
                    </Link>
                  </>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Vendor</p>
                <p className="font-medium">{so.vendor.name}</p>
                {so.vendor.gstin && (
                  <p className="text-xs text-muted-foreground">GSTIN {so.vendor.gstin}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Deliver to</p>
                <p>{so.deliverySection.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Delivery period</p>
                <p>{so.deliveryDays} days</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Issued</p>
                <p>
                  {so.issuedAt
                    ? `${so.issuedAt.toLocaleDateString("en-IN")} by ${so.issuedBy?.name ?? "—"}`
                    : "Not issued"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order lines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Sl</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">GST %</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {so.items.map((line, i) => (
                    <TableRow key={line.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{line.description}</TableCell>
                      <TableCell>{line.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(line.qty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {inr.format(Number(line.rate))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(line.gstPercent)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {inr.format(
                          soLineTotal({
                            qty: Number(line.qty),
                            rate: Number(line.rate),
                            gstPercent: Number(line.gstPercent),
                          }),
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={6} className="text-right font-medium">
                      Total (incl. GST)
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-primary">
                      {inr.format(total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terms & conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm">{so.terms}</p>
          </CardContent>
        </Card>

        <SoLifecycleActions
          soId={so.id}
          status={so.status}
          isNdc={user.role === "NDC"}
          canDraft={can(user, "update", "supplyOrder")}
          hasUndeliveredBalance={hasUndeliveredBalance}
          canCloseCase={canCloseCase}
        />
      </div>
    </>
  );
}
