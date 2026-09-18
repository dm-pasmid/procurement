import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { AgeChip } from "@/components/age-chip";
import { ReqStatusBadge } from "@/components/req-status-badge";
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
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";

export const metadata: Metadata = { title: "Approvals" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function ApprovalsPage() {
  const user = await requirePageAccess("/approvals");
  const slaHours = await getSettingNumber("APPROVAL_SLA_HOURS");

  // Per-role queue: OC sees own section's SUBMITTED; ADM sees OC_APPROVED;
  // DM sees ADM_APPROVED.
  let where: Prisma.RequisitionWhereInput;
  let levelLabel: string;
  if (user.role === "OC") {
    where = { status: "SUBMITTED", sectionId: user.sectionId };
    levelLabel = "OC review";
  } else if (user.role === "ADM") {
    // Scoped to the sections this ADM is in charge of; sections mapped to
    // no ADM fall back to every ADM so nothing stalls.
    where = {
      status: "OC_APPROVED",
      OR: [
        { section: { admIncharges: { some: { admId: user.id } } } },
        { section: { admIncharges: { none: {} } } },
      ],
    };
    levelLabel = "ADM approval";
  } else {
    where = { status: "ADM_APPROVED" };
    levelLabel = "DM approval";
  }

  const cases = await prisma.requisition.findMany({
    where,
    include: {
      section: true,
      initiator: true,
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "asc" }, // oldest waiting first
  });

  const flaggedIds = new Set(
    (
      await prisma.flag.findMany({
        where: {
          entityType: "Requisition",
          entityId: { in: cases.map((c) => c.id) },
          severity: "CRITICAL",
          acknowledgedAt: null,
        },
        select: { entityId: true },
      })
    ).map((f) => f.entityId),
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Approvals" }]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {cases.length === 0
          ? `No cases pending ${levelLabel}.`
          : `${cases.length} case${cases.length === 1 ? "" : "s"} pending ${levelLabel}. Ageing per SLA of ${slaHours} hours.`}
      </p>

      {cases.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ageing</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
                <TableHead>Final level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((req) => (
                <TableRow
                  key={req.id}
                  className={flaggedIds.has(req.id) ? "bg-critical/5" : undefined}
                >
                  <TableCell>
                    <AgeChip since={req.updatedAt} slaHours={slaHours} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {req.reqNumber}
                    {flaggedIds.has(req.id) && (
                      <Badge className="ml-2 bg-critical text-critical-foreground">
                        SPLITTING
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{req.section.name}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {req.purpose}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr.format(Number(req.estimatedTotal))}
                  </TableCell>
                  <TableCell>{req.finalLevel}</TableCell>
                  <TableCell>
                    <ReqStatusBadge status={req.status} />
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm">
                      <Link href={`/approvals/${req.id}`}>Open</Link>
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
