import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { BillForm } from "../../bill-form";

export const metadata: Metadata = { title: "Edit bill" };

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/bills");
  if (!can(user, "update", "bill")) redirect("/bills");

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      items: true,
      deductions: true,
      so: {
        include: {
          vendor: true,
          items: true,
          grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
          bills: { where: { id: { not: id } }, include: { items: true } },
        },
      },
    },
  });
  if (!bill) notFound();
  if (bill.status !== "ENTERED") redirect(`/bills/${id}`);

  const acceptedFor = (soItemId: string) =>
    bill.so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === soItemId)
          .reduce((s, g) => s + Number(g.qtyAccepted), 0),
      0,
    );
  const billedFor = (soItemId: string) =>
    bill.so.bills.reduce(
      (sum, b) =>
        sum +
        b.items
          .filter((x) => x.soItemId === soItemId)
          .reduce((s, x) => s + Number(x.payableQty), 0),
      0,
    );

  return (
    <>
      <PageHeader
        title="Edit bill"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Bills", href: "/bills" },
          { label: "Edit" },
        ]}
      />
      <BillForm
        presetSo={{
          soId: bill.soId,
          soNumber: bill.so.soNumber,
          vendorName: bill.so.vendor.name,
          grnNumbers: bill.so.grns.map((g) => g.grnNumber),
          priorBillCount: bill.so.bills.length,
          priorPayableTotal: bill.so.bills.reduce(
            (sum, b) => sum + Number(b.computedPayable),
            0,
          ),
          lines: bill.so.items.map((line) => ({
            soItemId: line.id,
            description: line.description,
            unit: line.unit,
            soRate: Number(line.rate),
            gstPercent: Number(line.gstPercent),
            ordered: Number(line.qty),
            acceptedCum: acceptedFor(line.id),
            alreadyBilled: billedFor(line.id),
          })),
        }}
        initial={{
          id: bill.id,
          vendorBillNumber: bill.vendorBillNumber,
          vendorBillDate: bill.vendorBillDate.toISOString().slice(0, 10),
          lines: Object.fromEntries(
            bill.items.map((l) => [
              l.soItemId,
              {
                soItemId: l.soItemId,
                billedQty: String(Number(l.billedQty)),
                billedRate: String(Number(l.billedRate)),
              },
            ]),
          ),
          deductions: bill.deductions.map((d) => ({
            key: d.id,
            type: d.type,
            amount: String(Number(d.amount)),
            remarks: d.remarks ?? "",
          })),
        }}
      />
    </>
  );
}
