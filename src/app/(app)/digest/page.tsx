import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/app/(app)/registers/print-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FLAG_TYPE_LABELS, flagEntityHref, flagNote } from "@/lib/flag-utils";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Weekly Digest" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dmy = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default async function DigestPage() {
  const user = await requireUser();
  if (user.role !== "ADM" && user.role !== "DM") redirect("/dashboard");

  const since = new Date(Date.now() - 7 * 86400000);
  const bigTicket = 20000;

  const [flagsRaised, approvals, closed] = await Promise.all([
    prisma.flag.findMany({
      where: { createdAt: { gte: since }, severity: { in: ["WARN", "CRITICAL"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    }),
    prisma.approvalAction.findMany({
      where: {
        createdAt: { gte: since },
        action: "APPROVE",
        requisition: { estimatedTotal: { gte: bigTicket } },
      },
      include: { requisition: { include: { section: true } }, actor: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.requisition.findMany({
      where: { status: "CLOSED", updatedAt: { gte: since } },
      include: { section: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // Dedup approvals to one row per requisition (latest level).
  const seen = new Set<string>();
  const bigApprovals = approvals.filter((a) => {
    if (seen.has(a.requisitionId)) return false;
    seen.add(a.requisitionId);
    return true;
  });

  return (
    <>
      <PageHeader
        title="Weekly Digest"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Weekly Digest" }]}
        action={<span className="print:hidden"><PrintButton /></span>}
      />

      <div className="mb-4 text-center print:mb-6">
        <p className="hidden text-sm font-semibold text-primary print:block">
          Office of the District Magistrate &amp; Collector, Paschim Medinipur
        </p>
        <p className="text-sm text-muted-foreground">
          Procurement — new in the last 7 days ({dmy(since)} to {dmy(new Date())}). For the Monday office meeting.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Flags raised
              <Badge className="ml-2 bg-warning text-warning-foreground">{flagsRaised.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {flagsRaised.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new flags this week.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {flagsRaised.map((f) => {
                  const href = flagEntityHref(f.entityType, f.entityId);
                  return (
                    <li key={f.id} className="flex gap-2">
                      <Badge className={f.severity === "CRITICAL" ? "bg-critical text-critical-foreground" : "bg-warning text-warning-foreground"}>
                        {FLAG_TYPE_LABELS[f.flagType]}
                      </Badge>
                      <span className="flex-1">{flagNote(f.details)}</span>
                      {href && (
                        <Link href={href} className="text-primary underline-offset-2 hover:underline print:hidden">
                          open
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Big-ticket approvals (&gt; {inr.format(bigTicket)})
              <Badge className="ml-2" variant="secondary">{bigApprovals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bigApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No big-ticket approvals this week.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {bigApprovals.map((a) => (
                  <li key={a.id}>
                    <Link href={`/requisitions/${a.requisitionId}`} className="font-medium text-primary hover:underline">
                      {a.requisition.reqNumber}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}— {a.requisition.section.name}, {inr.format(Number(a.requisition.estimatedTotal))}, {a.level} approved by {a.actor.name} on {dmy(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cases closed
              <Badge className="ml-2" variant="secondary">{closed.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {closed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cases closed this week.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {closed.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requisitions/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.reqNumber}
                    </Link>
                    <span className="text-muted-foreground"> — {r.section.name}, {r.purpose.slice(0, 60)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
