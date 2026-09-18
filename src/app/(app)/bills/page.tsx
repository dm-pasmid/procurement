import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BillStatusBadge } from "@/components/bill-status-badge";
import { Button } from "@/components/ui/button";
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

export const metadata: Metadata = { title: "Bills" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function BillsPage() {
  const user = await requirePageAccess("/bills");

  const bills = await prisma.bill.findMany({
    include: {
      so: { include: { vendor: true } },
      enteredBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Bills"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Bills" }]}
        action={
          can(user, "create", "bill") ? (
            <Button asChild>
              <Link href="/bills/new">
                <Plus /> New bill
              </Link>
            </Button>
          ) : undefined
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Vendor bills reconciled against Supply Order and countersigned GRNs.
        No bill is processed without a certified goods receipt.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>BPM number</TableHead>
              <TableHead>Vendor bill</TableHead>
              <TableHead>Supply order</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Claimed</TableHead>
              <TableHead className="text-right">Net payable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No bills yet.
                </TableCell>
              </TableRow>
            )}
            {bills.map((bill) => (
              <TableRow key={bill.id}>
                <TableCell className="font-medium">
                  {bill.bpmNumber.startsWith("DRAFT-") ? "—" : bill.bpmNumber}
                </TableCell>
                <TableCell className="text-sm">
                  {bill.vendorBillNumber} ·{" "}
                  {bill.vendorBillDate.toLocaleDateString("en-IN")}
                </TableCell>
                <TableCell>{bill.so.soNumber}</TableCell>
                <TableCell>{bill.so.vendor.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {inr.format(Number(bill.claimedAmount))}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {inr.format(Number(bill.netPayable))}
                </TableCell>
                <TableCell>
                  <BillStatusBadge status={bill.status} />
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/bills/${bill.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
