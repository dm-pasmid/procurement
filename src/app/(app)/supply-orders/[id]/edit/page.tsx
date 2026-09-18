import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { SoForm } from "../../so-form";

export const metadata: Metadata = { title: "Edit supply order" };

export default async function EditSoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/supply-orders");
  if (!can(user, "update", "supplyOrder")) redirect("/supply-orders");

  const so = await prisma.supplyOrder.findUnique({
    where: { id },
    include: { items: true, requisition: true, vendor: true },
  });
  if (!so) notFound();
  if (so.status !== "DRAFT") redirect(`/supply-orders/${id}`);

  const [sections, tolerancePct] = await Promise.all([
    prisma.section.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getSettingNumber("EST_TOLERANCE_PCT"),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit supply order draft${so.version > 1 ? ` (v${so.version})` : ""}`}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Supply Orders", href: "/supply-orders" },
          { label: "Edit draft" },
        ]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {so.requisition.reqNumber} · Vendor{" "}
        <span className="font-medium text-foreground">{so.vendor.name}</span>
      </p>
      <SoForm
        soId={so.id}
        requisitionId={so.requisitionId}
        sanction={Number(so.requisition.sanctionedTotal ?? so.requisition.estimatedTotal)}
        tolerancePct={tolerancePct}
        sections={sections.map((s) => ({ id: s.id, name: s.name }))}
        initialDeliverySectionId={so.deliverySectionId}
        initialDeliveryDays={String(so.deliveryDays)}
        deliverySuggested={false}
        initialTerms={so.terms}
        initialLines={so.items.map((line) => ({
          key: line.id,
          reqItemId: line.reqItemId,
          description: line.description,
          unit: line.unit,
          qty: String(Number(line.qty)),
          rate: String(Number(line.rate)),
          gstPercent: String(Number(line.gstPercent)),
        }))}
      />
    </>
  );
}
