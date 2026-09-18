import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReqStatusBadge } from "@/components/req-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { scoreVendors } from "@/lib/vendorScore";
import { ProcurementForm } from "./procurement-form";

export const metadata: Metadata = { title: "Record procurement" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default async function ProcurementCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageAccess("/procurement-queue");

  const req = await prisma.requisition.findUnique({
    where: { id },
    include: {
      section: true,
      items: { include: { item: true } },
      procurement: { include: { vendor: true } },
    },
  });
  if (!req) notFound();
  if (req.status !== "APPROVED" && req.status !== "IN_PROCUREMENT") {
    redirect("/procurement-queue");
  }

  const [vendors, tolerancePct] = await Promise.all([
    prisma.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    getSettingNumber("EST_TOLERANCE_PCT"),
  ]);
  const scores = await scoreVendors(vendors.map((v) => v.id));

  const attachments = await prisma.attachment.findMany({
    where: { entityType: "Requisition", entityId: req.id },
    orderBy: { createdAt: "asc" },
  });

  const sanction = Number(req.sanctionedTotal ?? req.estimatedTotal);
  const canEdit =
    req.status === "APPROVED" && can(user, "create", "procurement");

  return (
    <>
      <PageHeader
        title={`Procurement — ${req.reqNumber}`}
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Procurement Queue", href: "/procurement-queue" },
          { label: req.reqNumber },
        ]}
        action={
          req.status === "IN_PROCUREMENT" ? (
            <Button asChild>
              <Link href={`/supply-orders/new?requisitionId=${req.id}`}>
                Draft Supply Order
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <ReqStatusBadge status={req.status} />
              <span className="text-sm font-normal text-muted-foreground">
                {req.section.name} · Sanctioned{" "}
                <span className="font-semibold text-primary">
                  {inr.format(sanction)}
                </span>{" "}
                · Final level {req.finalLevel}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{req.purpose}</p>
            <ul className="mt-2 text-sm text-muted-foreground">
              {req.items.map((line) => (
                <li key={line.id}>
                  {line.item?.name ?? line.itemNameFree} — {Number(line.qty)}{" "}
                  {line.unit} @ {inr.format(Number(line.estRate))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ProcurementForm
        requisitionId={req.id}
        sanction={sanction}
        tolerancePct={tolerancePct}
        canEdit={canEdit}
        isNdc={user.role === "NDC"}
        confirmed={!!req.procurement?.confirmedAt}
        vendors={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          gstin: v.gstin,
          empanelled: v.empanelled,
          empanelmentRef: v.empanelmentRef,
          empanelmentValidTill: v.empanelmentValidTill?.toISOString() ?? null,
          score: scores[v.id],
        }))}
        initial={
          req.procurement
            ? {
                mode: req.procurement.mode,
                nitNumber: req.procurement.nitNumber ?? "",
                nitDate: req.procurement.nitDate?.toISOString().slice(0, 10) ?? "",
                bidsReceived: req.procurement.bidsReceived?.toString() ?? "",
                gemOrderRef: req.procurement.gemOrderRef ?? "",
                vendorId: req.procurement.vendorId,
                procuredAmount: Number(req.procurement.procuredAmount).toString(),
                remarks: req.procurement.remarks ?? "",
              }
            : null
        }
        attachments={attachments.map((a) => ({
          id: a.id,
          label: a.label,
          createdAt: a.createdAt.toLocaleDateString("en-IN"),
        }))}
      />
    </>
  );
}
