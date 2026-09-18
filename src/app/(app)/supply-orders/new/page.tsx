import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { SoForm } from "../so-form";

export const metadata: Metadata = { title: "Draft supply order" };

/** Average actual delivery time (issue → last receipt) for the vendor. */
async function suggestedDeliveryDays(vendorId: string): Promise<number | null> {
  const orders = await prisma.supplyOrder.findMany({
    where: { vendorId, issuedAt: { not: null }, grns: { some: {} } },
    include: { grns: { orderBy: { receiptDate: "desc" }, take: 1 } },
    take: 20,
    orderBy: { issuedAt: "desc" },
  });
  const durations = orders
    .filter((so) => so.issuedAt && so.grns[0])
    .map(
      (so) =>
        (so.grns[0].receiptDate.getTime() - so.issuedAt!.getTime()) /
        (24 * 60 * 60 * 1000),
    );
  if (durations.length === 0) return null;
  return Math.max(1, Math.round(durations.reduce((a, b) => a + b, 0) / durations.length));
}

export default async function NewSoPage({
  searchParams,
}: {
  searchParams: Promise<{ requisitionId?: string }>;
}) {
  const user = await requirePageAccess("/supply-orders");
  if (!can(user, "create", "supplyOrder")) redirect("/supply-orders");

  const { requisitionId } = await searchParams;
  if (!requisitionId) redirect("/procurement-queue");

  const req = await prisma.requisition.findUnique({
    where: { id: requisitionId },
    include: {
      section: true,
      items: { include: { item: true } },
      procurement: { include: { vendor: true } },
      supplyOrders: { where: { status: { in: ["DRAFT", "ISSUED"] } } },
    },
  });
  if (!req || !req.procurement) notFound();
  if (req.status !== "IN_PROCUREMENT") redirect("/procurement-queue");
  if (req.supplyOrders.length > 0) {
    redirect(`/supply-orders/${req.supplyOrders[0].id}`);
  }

  const [sections, tolerancePct, termsSetting, suggested] = await Promise.all([
    prisma.section.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getSettingNumber("EST_TOLERANCE_PCT"),
    prisma.setting.findUnique({ where: { key: "SO_TERMS_TEMPLATE" } }),
    suggestedDeliveryDays(req.procurement.vendorId),
  ]);

  const fallbackDays = req.desiredDeliveryDays ?? 15;

  return (
    <>
      <PageHeader
        title={`Draft supply order — ${req.reqNumber}`}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Supply Orders", href: "/supply-orders" },
          { label: "New" },
        ]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Vendor:{" "}
        <span className="font-medium text-foreground">
          {req.procurement.vendor.name}
        </span>{" "}
        ({req.procurement.mode}) · Sanction ₹
        {Number(req.sanctionedTotal ?? req.estimatedTotal).toLocaleString("en-IN")}
      </p>
      <SoForm
        requisitionId={req.id}
        sanction={Number(req.sanctionedTotal ?? req.estimatedTotal)}
        tolerancePct={tolerancePct}
        sections={sections.map((s) => ({ id: s.id, name: s.name }))}
        initialDeliverySectionId={req.sectionId}
        initialDeliveryDays={String(suggested ?? fallbackDays)}
        deliverySuggested={suggested !== null}
        initialTerms={termsSetting?.value ?? ""}
        initialLines={req.items.map((line) => ({
          key: line.id,
          reqItemId: line.id,
          description:
            (line.item?.name ?? line.itemNameFree ?? "") +
            (line.specification ? ` — ${line.specification}` : ""),
          unit: line.unit,
          qty: String(Number(line.qty)),
          rate: "",
          gstPercent: "0",
        }))}
      />
    </>
  );
}
