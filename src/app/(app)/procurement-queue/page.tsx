import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AgeChip } from "@/components/age-chip";
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
import { getSettingNumber } from "@/lib/settings";

export const metadata: Metadata = { title: "Procurement Queue" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function ProcurementQueuePage() {
  const user = await requirePageAccess("/procurement-queue");
  const idleDays = await getSettingNumber("PROC_IDLE_DAYS");

  const queue = await prisma.requisition.findMany({
    where: { status: "APPROVED" },
    include: {
      section: true,
      procurement: { include: { vendor: true } },
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "asc" }, // oldest first
  });

  // Idle beyond PROC_IDLE_DAYS → APPROVAL_SLA flag with stage='procurement',
  // created once per requisition.
  const now = Date.now();
  const idleMs = idleDays * 24 * 60 * 60 * 1000;
  for (const req of queue) {
    if (now - req.updatedAt.getTime() <= idleMs) continue;
    const existing = await prisma.flag.findFirst({
      where: {
        entityType: "Requisition",
        entityId: req.id,
        flagType: "APPROVAL_SLA",
        details: { path: ["stage"], equals: "procurement" },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.flag.create({
        data: {
          entityType: "Requisition",
          entityId: req.id,
          flagType: "APPROVAL_SLA",
          severity: "WARN",
          details: {
            stage: "procurement",
            idleDays,
            approvedAt: req.updatedAt.toISOString(),
            note: `Idle in procurement queue beyond ${idleDays} days`,
          },
        },
      });
    }
  }

  const canRecord = can(user, "create", "procurement");

  return (
    <>
      <PageHeader
        title="Procurement Queue"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Procurement Queue" },
        ]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        {queue.length === 0
          ? "No approved requisitions awaiting procurement."
          : `${queue.length} approved requisition${queue.length === 1 ? "" : "s"} awaiting procurement, oldest first. Amber beyond ${idleDays} idle days.`}
      </p>

      {queue.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Idle</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Sanctioned</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    {/* Amber from PROC_IDLE_DAYS, red beyond twice that. */}
                    <AgeChip since={req.updatedAt} slaHours={idleDays * 48} />
                  </TableCell>
                  <TableCell className="font-medium">{req.reqNumber}</TableCell>
                  <TableCell>{req.section.name}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {req.purpose}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {req._count.items}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr.format(Number(req.sanctionedTotal ?? req.estimatedTotal))}
                  </TableCell>
                  <TableCell>
                    {req.procurement ? (
                      <Badge className="bg-warning text-warning-foreground">
                        Draft — {req.procurement.vendor.name}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not recorded</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="sm">
                      <Link href={`/procurement-queue/${req.id}`}>
                        {canRecord ? "Record" : "Open"}
                      </Link>
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
