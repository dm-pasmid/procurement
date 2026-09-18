import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DeliveryCountdown, SoStatusBadge } from "@/components/so-status-badge";
import { Button } from "@/components/ui/button";
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
import { soTotal } from "@/lib/so-utils";

export const metadata: Metadata = { title: "Supply Orders" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function SupplyOrdersPage() {
  await requirePageAccess("/supply-orders");

  const orders = await prisma.supplyOrder.findMany({
    include: {
      vendor: true,
      requisition: true,
      deliverySection: true,
      items: true,
      grns: { select: { id: true }, take: 1 },
    },
    orderBy: { fy: "desc" },
  });
  // Recent first: drafts (no issue date) on top, then latest issued.
  orders.sort(
    (a, b) =>
      (b.issuedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (a.issuedAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
  );

  // Overdue issued SOs raise a DELIVERY_OVERDUE flag — once per SO per day.
  const today = new Date().toISOString().slice(0, 10);
  for (const so of orders) {
    if (so.status !== "ISSUED" || !so.issuedAt || so.grns.length > 0) continue;
    const due = so.issuedAt.getTime() + so.deliveryDays * 24 * 60 * 60 * 1000;
    if (Date.now() <= due) continue;
    const existing = await prisma.flag.findFirst({
      where: {
        entityType: "SupplyOrder",
        entityId: so.id,
        flagType: "DELIVERY_OVERDUE",
        details: { path: ["date"], equals: today },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.flag.create({
        data: {
          entityType: "SupplyOrder",
          entityId: so.id,
          flagType: "DELIVERY_OVERDUE",
          severity: "WARN",
          details: {
            date: today,
            soNumber: so.soNumber,
            overdueDays: Math.ceil((Date.now() - due) / (24 * 60 * 60 * 1000)),
          },
        },
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Supply Orders"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Supply Orders" }]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {orders.length === 0
          ? "No supply orders yet — draft one from a confirmed procurement in the queue."
          : `${orders.length} supply order${orders.length === 1 ? "" : "s"}.`}
      </p>

      {orders.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Requisition</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Deliver to</TableHead>
                <TableHead className="text-right">Total (incl. GST)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((so) => (
                <TableRow key={so.id}>
                  <TableCell className="font-medium">
                    {so.soNumber.startsWith("DRAFT-") ? "Draft" : so.soNumber}
                    {so.version > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        v{so.version}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{so.requisition.reqNumber}</TableCell>
                  <TableCell>{so.vendor.name}</TableCell>
                  <TableCell>{so.deliverySection.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr.format(
                      soTotal(
                        so.items.map((l) => ({
                          qty: Number(l.qty),
                          rate: Number(l.rate),
                          gstPercent: Number(l.gstPercent),
                        })),
                      ),
                    )}
                  </TableCell>
                  <TableCell>
                    <SoStatusBadge status={so.status} />
                  </TableCell>
                  <TableCell>
                    {so.status === "ISSUED" && so.issuedAt ? (
                      <DeliveryCountdown
                        issuedAt={so.issuedAt}
                        deliveryDays={so.deliveryDays}
                        received={so.grns.length > 0}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/supply-orders/${so.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
