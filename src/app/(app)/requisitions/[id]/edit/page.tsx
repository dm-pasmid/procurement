import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { loadAdmLimit, loadMasterItems } from "../../form-data";
import { RequisitionForm } from "../../requisition-form";

export const metadata: Metadata = { title: "Edit requisition" };

export default async function EditRequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/requisitions");

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!req) notFound();
  if (!can(user, "update", "requisition", { sectionId: req.sectionId })) {
    redirect("/requisitions");
  }
  if (req.status !== "DRAFT" && req.status !== "RETURNED") {
    redirect(`/requisitions/${id}`);
  }

  const [items, admLimit] = await Promise.all([
    loadMasterItems(),
    loadAdmLimit(),
  ]);

  const label = req.reqNumber.startsWith("DRAFT-") ? "Draft" : req.reqNumber;

  return (
    <>
      <PageHeader
        title={`Edit requisition — ${label}`}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Requisitions", href: "/requisitions" },
          { label: label, href: `/requisitions/${id}` },
          { label: "Edit" },
        ]}
      />
      <RequisitionForm
        items={items}
        admLimit={admLimit}
        initial={{
          id: req.id,
          purpose: req.purpose,
          desiredDeliveryDays: req.desiredDeliveryDays?.toString() ?? "",
          lines: req.items.map((l) => ({
            key: l.id,
            itemId: l.itemId,
            itemNameFree: l.itemNameFree ?? "",
            specification: l.specification ?? "",
            unit: l.unit,
            qty: Number(l.qty) ? Number(l.qty).toString() : "",
            estRate: Number(l.estRate) ? Number(l.estRate).toString() : "",
            estBasis: l.estBasis,
            basisRemarks: l.basisRemarks ?? "",
          })),
        }}
      />
    </>
  );
}
