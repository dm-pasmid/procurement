import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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

export const metadata: Metadata = { title: "GRN" };

export default async function GrnListPage() {
  const user = await requirePageAccess("/grn");

  // Receiving is section business: INITIATOR/OC see their own section's GRNs.
  const sectionScoped = user.role === "INITIATOR" || user.role === "OC";
  const where: Prisma.GrnWhereInput = sectionScoped
    ? { so: { deliverySectionId: user.sectionId } }
    : {};

  const grns = await prisma.grn.findMany({
    where,
    include: {
      so: { include: { vendor: true, deliverySection: true } },
      receiver: true,
      ocCountersignedBy: true,
    },
    orderBy: { receiptDate: "desc" },
    take: 200,
  });

  const canCreate = can(user, "create", "grn", { sectionId: user.sectionId });

  return (
    <>
      <PageHeader
        title="GRN"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "GRN" }]}
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/grn/new">
                <Plus /> New GRN
              </Link>
            </Button>
          ) : undefined
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Goods receipt notes{sectionScoped ? ` for ${user.sectionName}` : ""}.
        Only countersigned GRNs count for billing.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Supply order</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Receipt date</TableHead>
              <TableHead>Challan</TableHead>
              <TableHead>Receiver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No goods receipt notes yet.
                </TableCell>
              </TableRow>
            )}
            {grns.map((grn) => (
              <TableRow key={grn.id}>
                <TableCell className="font-medium">
                  {grn.grnNumber.startsWith("DRAFT-") ? "Draft" : grn.grnNumber}
                </TableCell>
                <TableCell>{grn.so.soNumber}</TableCell>
                <TableCell>{grn.so.vendor.name}</TableCell>
                <TableCell>{grn.receiptDate.toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {grn.challanNumber} · {grn.challanDate.toLocaleDateString("en-IN")}
                </TableCell>
                <TableCell>{grn.receiver.name}</TableCell>
                <TableCell>
                  {grn.status === "COUNTERSIGNED" ? (
                    <Badge className="border-transparent bg-primary text-primary-foreground">
                      Countersigned
                    </Badge>
                  ) : (
                    <Badge className="border-transparent bg-warning text-warning-foreground">
                      Awaiting OC
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/grn/${grn.id}`}>Open</Link>
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
