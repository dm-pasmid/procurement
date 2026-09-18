import type { Metadata } from "next";
import Link from "next/link";
import { Prisma, ReqStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { REQ_STATUS_LABELS, ReqStatusBadge } from "@/components/req-status-badge";
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

export const metadata: Metadata = { title: "Requisitions" };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    fy?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requirePageAccess("/requisitions");
  const filters = await searchParams;

  const sectionScoped = user.role === "INITIATOR" || user.role === "OC";

  const where: Prisma.RequisitionWhereInput = {};
  if (sectionScoped) {
    where.sectionId = user.sectionId;
  } else {
    where.status = { not: "DRAFT" }; // drafts are visible only to their section
  }
  if (filters.status && filters.status in REQ_STATUS_LABELS) {
    where.status = filters.status as ReqStatus;
  }
  if (filters.fy) where.fy = filters.fy;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to + "T23:59:59") } : {}),
    };
  }

  const [requisitions, fys] = await Promise.all([
    prisma.requisition.findMany({
      where,
      include: {
        section: true,
        initiator: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.requisition.findMany({
      where: sectionScoped ? { sectionId: user.sectionId } : {},
      select: { fy: true },
      distinct: ["fy"],
      orderBy: { fy: "desc" },
    }),
  ]);

  const canCreate = can(user, "create", "requisition", {
    sectionId: user.sectionId,
  });

  return (
    <>
      <PageHeader
        title="Requisitions"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Requisitions" }]}
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/requisitions/new">
                <Plus /> New requisition
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Filters — GET form keeps everything linkable */}
      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/50 p-3"
      >
        <div className="space-y-1">
          <label htmlFor="f-status" className="text-xs font-medium">
            Status
          </label>
          <select
            id="f-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
          >
            <option value="">All</option>
            {Object.entries(REQ_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-fy" className="text-xs font-medium">
            FY
          </label>
          <select
            id="f-fy"
            name="fy"
            defaultValue={filters.fy ?? ""}
            className="border-input bg-background h-8 w-28 rounded-md border px-2 text-sm"
          >
            <option value="">All</option>
            {fys.map((f) => (
              <option key={f.fy} value={f.fy}>
                {f.fy}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-from" className="text-xs font-medium">
            From
          </label>
          <input
            id="f-from"
            type="date"
            name="from"
            defaultValue={filters.from ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="f-to" className="text-xs font-medium">
            To
          </label>
          <input
            id="f-to"
            type="date"
            name="to"
            defaultValue={filters.to ?? ""}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/requisitions">Clear</Link>
        </Button>
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Purpose</TableHead>
              {!sectionScoped && <TableHead>Section</TableHead>}
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Estimate</TableHead>
              <TableHead>Final level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requisitions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={sectionScoped ? 7 : 8}
                  className="py-8 text-center text-muted-foreground"
                >
                  No requisitions found.
                </TableCell>
              </TableRow>
            )}
            {requisitions.map((req) => (
              <TableRow key={req.id}>
                <TableCell>
                  <Link
                    href={`/requisitions/${req.id}`}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {req.reqNumber.startsWith("DRAFT-")
                      ? "Draft"
                      : req.reqNumber}
                  </Link>
                </TableCell>
                <TableCell className="max-w-72 truncate">
                  {req.purpose}
                </TableCell>
                {!sectionScoped && <TableCell>{req.section.name}</TableCell>}
                <TableCell className="text-right tabular-nums">
                  {req._count.items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {inr.format(Number(req.estimatedTotal))}
                </TableCell>
                <TableCell>{req.finalLevel}</TableCell>
                <TableCell>
                  <ReqStatusBadge status={req.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {req.createdAt.toLocaleDateString("en-IN")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
