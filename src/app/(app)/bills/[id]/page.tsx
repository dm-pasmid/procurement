import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BillStatusBadge } from "@/components/bill-status-badge";
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
import { BillDetailActions } from "./bill-detail-actions";
import { BillPaymentsCard } from "./bill-payments-card";

export const metadata: Metadata = { title: "Bill" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const DEDUCTION_LABELS: Record<string, string> = {
  SECURITY_DEPOSIT: "Security Deposit",
  LD_PENALTY: "LD / Penalty",
  TDS_IT: "TDS (IT)",
  TDS_GST: "TDS (GST)",
  OTHER: "Other",
};

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/bills");

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      items: true,
      deductions: true,
      enteredBy: true,
      payments: { include: { enteredBy: true }, orderBy: { voucherDate: "asc" } },
      so: {
        include: {
          vendor: true,
          items: true,
          grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
        },
      },
    },
  });
  if (!bill) notFound();

  const soLineById = new Map(bill.so.items.map((l) => [l.id, l]));
  const acceptedFor = (soItemId: string) =>
    bill.so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === soItemId)
          .reduce((s, g) => s + Number(g.qtyAccepted), 0),
      0,
    );

  const isDraftNumber = bill.bpmNumber.startsWith("DRAFT-");
  const label = isDraftNumber ? "Bill (memo pending)" : bill.bpmNumber;
  const canEdit = bill.status === "ENTERED" && can(user, "update", "bill");

  const attachments = await prisma.attachment.findMany({
    where: { entityType: "Bill", entityId: bill.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        title={label}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Bills", href: "/bills" },
          { label: isDraftNumber ? "Entered" : bill.bpmNumber },
        ]}
        action={
          <div className="flex gap-2">
            {bill.status !== "ENTERED" && (
              <Button asChild variant="outline">
                <a href={`/bills/${bill.id}/pdf`} target="_blank" rel="noreferrer">
                  <FileDown /> Memo PDF
                </a>
              </Button>
            )}
            {canEdit && (
              <Button asChild>
                <Link href={`/bills/${bill.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <BillStatusBadge status={bill.status} />
              <span className="text-sm font-normal text-muted-foreground">
                Vendor bill {bill.vendorBillNumber} dated{" "}
                {bill.vendorBillDate.toLocaleDateString("en-IN")} · Against{" "}
                <Link
                  href={`/supply-orders/${bill.soId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {bill.so.soNumber}
                </Link>{" "}
                · {bill.so.vendor.name} · GRNs:{" "}
                {bill.so.grns.map((g) => g.grnNumber).join(", ")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Entered by {bill.enteredBy.name} on{" "}
            {bill.createdAt.toLocaleDateString("en-IN")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Three-way comparison — SO vs GRN vs bill
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Payable qty</TableHead>
                    <TableHead className="text-right">SO rate</TableHead>
                    <TableHead className="text-right">Billed rate</TableHead>
                    <TableHead className="text-right">Payable amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.items.map((line) => {
                    const soLine = soLineById.get(line.soItemId);
                    const deviations = line.lineDeviations as {
                      qtyCapped?: boolean;
                      rateCapped?: boolean;
                      notes?: string[];
                    };
                    const gstFactor = soLine ? 1 + Number(soLine.gstPercent) / 100 : 1;
                    const amount =
                      Number(line.payableQty) * Number(line.payableRate) * gstFactor;
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {soLine?.description ?? "—"}
                          {(deviations.notes ?? []).map((note, i) => (
                            <span
                              key={i}
                              className="block text-xs font-normal italic text-warning"
                            >
                              {note}
                            </span>
                          ))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {soLine ? Number(soLine.qty) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {acceptedFor(line.soItemId)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(line.billedQty)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {Number(line.payableQty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {soLine ? inr.format(Number(soLine.rate)) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inr.format(Number(line.billedRate))}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr.format(amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deductions (manual)</CardTitle>
            </CardHeader>
            <CardContent>
              {bill.deductions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deductions.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {bill.deductions.map((d) => (
                    <li key={d.id} className="flex justify-between gap-4">
                      <span>
                        {DEDUCTION_LABELS[d.type]}
                        {d.remarks && (
                          <span className="block text-xs text-muted-foreground">
                            {d.remarks}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        − {inr.format(Number(d.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Claimed amount</span>
                <span className="tabular-nums">{inr.format(Number(bill.claimedAmount))}</span>
              </div>
              <div className="flex justify-between">
                <span>Computed payable</span>
                <span className="tabular-nums">{inr.format(Number(bill.computedPayable))}</span>
              </div>
              <div className="flex justify-between text-critical">
                <span>Deductions</span>
                <span className="tabular-nums">− {inr.format(Number(bill.deductionsTotal))}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold text-primary">
                <span>NET PAYABLE</span>
                <span className="tabular-nums">{inr.format(Number(bill.netPayable))}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {bill.status !== "ENTERED" && (
          <BillPaymentsCard
            billId={bill.id}
            netPayable={Number(bill.netPayable)}
            paidSoFar={bill.payments.reduce((s, p) => s + Number(p.amountPaid), 0)}
            canPay={can(user, "create", "payment")}
            payments={bill.payments.map((p) => ({
              id: p.id,
              voucherNumber: p.voucherNumber,
              voucherDate: p.voucherDate.toLocaleDateString("en-IN"),
              amountPaid: Number(p.amountPaid),
              mode: p.mode,
              remarks: p.remarks,
              enteredBy: p.enteredBy.name,
            }))}
          />
        )}

        <BillDetailActions
          billId={bill.id}
          status={bill.status}
          isNdc={user.role === "NDC"}
          canEdit={canEdit}
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
