import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FLAG_TYPE_LABELS, flagEntityHref, flagNote } from "@/lib/flag-utils";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { FlagAckButton } from "./flag-ack-button";

export const metadata: Metadata = { title: "Flags" };

const SEVERITY_STYLES: Record<string, string> = {
  INFO: "bg-muted text-muted-foreground",
  WARN: "bg-warning text-warning-foreground",
  CRITICAL: "bg-critical text-critical-foreground",
};

export default async function FlagsPage() {
  await requirePageAccess("/flags");

  const flags = await prisma.flag.findMany({
    include: { acknowledgedBy: true },
    orderBy: [{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 300,
  });
  const open = flags.filter((f) => !f.acknowledgedAt).length;

  return (
    <>
      <PageHeader
        title="Flags"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Flags" }]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Integrity and ageing digest. {open} open flag{open === 1 ? "" : "s"};
        acknowledgements are recorded with actor, time and remarks.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No flags raised yet.
                </TableCell>
              </TableRow>
            )}
            {flags.map((flag) => {
              const href = flagEntityHref(flag.entityType, flag.entityId);
              return (
                <TableRow
                  key={flag.id}
                  className={flag.acknowledgedAt ? "opacity-60" : undefined}
                >
                  <TableCell>
                    <Badge className={cn("border-transparent", SEVERITY_STYLES[flag.severity])}>
                      {flag.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {FLAG_TYPE_LABELS[flag.flagType]}
                  </TableCell>
                  <TableCell className="max-w-96 text-sm">
                    {flagNote(flag.details)}
                    {href && (
                      <Link
                        href={href}
                        className="ml-2 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        Open record
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {flag.createdAt.toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {flag.acknowledgedAt ? (
                      <span className="text-muted-foreground">
                        Ack by {flag.acknowledgedBy?.name} on{" "}
                        {flag.acknowledgedAt.toLocaleDateString("en-IN")}
                      </span>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!flag.acknowledgedAt && <FlagAckButton flagId={flag.id} />}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
