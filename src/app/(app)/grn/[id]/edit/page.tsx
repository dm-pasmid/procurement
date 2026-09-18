import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { GrnEntryForm } from "../../grn-entry-form";

export const metadata: Metadata = { title: "Edit GRN" };

export default async function EditGrnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/grn");

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      items: true,
      so: {
        include: {
          vendor: true,
          deliverySection: true,
          items: true,
          grns: { where: { id: { not: id } }, include: { items: true } },
        },
      },
    },
  });
  if (!grn) notFound();
  if (!can(user, "update", "grn", { sectionId: grn.so.deliverySectionId })) {
    redirect("/grn");
  }
  if (grn.status !== "DRAFT") redirect(`/grn/${id}`);

  const receivedSoFar = (soItemId: string) =>
    grn.so.grns.reduce(
      (sum, g) =>
        sum +
        g.items
          .filter((x) => x.soItemId === soItemId)
          .reduce((s, x) => s + Number(x.qtyReceived), 0),
      0,
    );

  return (
    <>
      <PageHeader
        title="Edit goods receipt note"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "GRN", href: "/grn" },
          { label: "Edit" },
        ]}
      />
      <GrnEntryForm
        presetSo={{
          soId: grn.soId,
          soNumber: grn.so.soNumber,
          vendorName: grn.so.vendor.name,
          deliverySectionName: grn.so.deliverySection.name,
          lines: grn.so.items.map((line) => ({
            soItemId: line.id,
            description: line.description,
            unit: line.unit,
            ordered: Number(line.qty),
            receivedSoFar: receivedSoFar(line.id),
          })),
        }}
        initial={{
          id: grn.id,
          receiptDate: grn.receiptDate.toISOString().slice(0, 10),
          challanNumber: grn.challanNumber,
          challanDate: grn.challanDate.toISOString().slice(0, 10),
          remarks: grn.remarks ?? "",
          lines: Object.fromEntries(
            grn.items.map((l) => [
              l.soItemId,
              {
                soItemId: l.soItemId,
                qtyReceived: String(Number(l.qtyReceived)),
                qtyAccepted: String(Number(l.qtyAccepted)),
                qtyRejected: String(Number(l.qtyRejected)),
                remarks: l.remarks ?? "",
              },
            ]),
          ),
        }}
      />
    </>
  );
}
