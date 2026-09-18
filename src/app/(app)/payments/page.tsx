import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { BillStatusBadge } from "@/components/bill-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Payments" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function PaymentsPage() {
  await requirePageAccess("/payments");

  const payments = await prisma.payment.findMany({
    include: {
      bill: { include: { so: { include: { vendor: true } } } },
      enteredBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Payments"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Payments" }]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Payment happens offline on the physical file; this register records
        the outcome. Payments are entered from the bill page.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Bill (BPM)</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Amount paid</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Bill status</TableHead>
              <TableHead>Entered by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No payments recorded yet.
                </TableCell>
              </TableRow>
            )}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.voucherNumber}</TableCell>
                <TableCell className="text-sm">
                  {p.voucherDate.toLocaleDateString("en-IN")}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/bills/${p.billId}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {p.bill.bpmNumber.startsWith("DRAFT-") ? "Bill" : p.bill.bpmNumber}
                  </Link>
                </TableCell>
                <TableCell>{p.bill.so.vendor.name}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {inr.format(Number(p.amountPaid))}
                </TableCell>
                <TableCell className="text-sm">{p.mode ?? "—"}</TableCell>
                <TableCell>
                  <BillStatusBadge status={p.bill.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.enteredBy.name}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
