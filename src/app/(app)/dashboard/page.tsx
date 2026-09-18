import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReqStatusBadge } from "@/components/req-status-badge";
import { MonthlySpendChart, SpendByBarChart } from "@/components/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { runAgeingFlagsThrottled } from "@/lib/ageing-flags";
import type { CurrentUser } from "@/lib/auth";
import {
  attentionGroups,
  cycleTimes,
  dmAdmTopStrip,
  monthlySpend12m,
  ndcDashboard,
  sectionDashboard,
  spendByCategory,
  spendBySection,
  type AttentionGroup,
  type TopStripMetric,
} from "@/lib/dashboard";
import { deriveFy } from "@/lib/numbering";
import { requirePageAccess } from "@/lib/page-guard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageAccess("/dashboard");
  await runAgeingFlagsThrottled();

  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumb={[{ label: "Home" }]}
        action={
          user.role === "ADM" || user.role === "DM" ? (
            <Link href="/digest" className="text-sm text-primary underline-offset-2 hover:underline">
              Weekly digest →
            </Link>
          ) : undefined
        }
      />
      {user.role === "ADM" || user.role === "DM" ? (
        <DmAdmDashboard user={user} />
      ) : user.role === "NDC" ? (
        <NdcDashboard />
      ) : (
        <SectionDashboard user={user} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function MetricCard({ m }: { m: TopStripMetric }) {
  return (
    <Link
      href={m.href}
      className={cn(
        "rounded-md border p-3 transition-colors hover:bg-muted/50",
        m.tone === "warning" && "border-warning/50",
        m.tone === "critical" && "border-critical/50",
      )}
    >
      <p className="text-xs text-muted-foreground">{m.label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          m.tone === "warning" && "text-warning",
          m.tone === "critical" && "text-critical",
          (!m.tone || m.tone === "default") && "text-primary",
        )}
      >
        {m.value}
      </p>
      {m.hint && <p className="text-xs text-muted-foreground">{m.hint}</p>}
    </Link>
  );
}

function AttentionPanel({ groups }: { groups: AttentionGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attention needed</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open integrity or ageing flags. The panel is clear.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.type}
                className={cn(
                  "rounded-md border p-3",
                  g.severity === "CRITICAL" ? "border-critical/50 bg-critical/5" : "border-warning/50 bg-warning/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle
                      className={cn("size-4", g.severity === "CRITICAL" ? "text-critical" : "text-warning")}
                    />
                    {g.label}
                  </p>
                  <Badge
                    className={cn(
                      "border-transparent",
                      g.severity === "CRITICAL" ? "bg-critical text-critical-foreground" : "bg-warning text-warning-foreground",
                    )}
                  >
                    {g.count}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{g.worstExample}</p>
                <div className="mt-2 flex gap-3 text-xs">
                  {g.worstHref && (
                    <Link href={g.worstHref} className="text-primary underline-offset-2 hover:underline">
                      Open case
                    </Link>
                  )}
                  <Link href={g.reviewHref} className="text-primary underline-offset-2 hover:underline">
                    Review all {g.count}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DM / ADM
// ---------------------------------------------------------------------------

async function DmAdmDashboard({ user }: { user: CurrentUser }) {
  const fy = deriveFy();
  const [strip, groups, monthly, bySection, byCategory, cycles] = await Promise.all([
    dmAdmTopStrip(user),
    attentionGroups(),
    monthlySpend12m(),
    spendBySection(fy),
    spendByCategory(fy),
    cycleTimes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {strip.map((m) => (
          <MetricCard key={m.label} m={m} />
        ))}
      </div>

      <AttentionPanel groups={groups} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly spend (12 months)</CardTitle></CardHeader>
          <CardContent><MonthlySpendChart data={monthly} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Spend by section (FY {fy})</CardTitle></CardHeader>
          <CardContent>
            {bySection.length === 0 ? <EmptyChart /> : <SpendByBarChart data={bySection} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Spend by category (FY {fy})</CardTitle></CardHeader>
          <CardContent>
            {byCategory.length === 0 ? <EmptyChart /> : <SpendByBarChart data={byCategory} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Average cycle time</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {cycles.map((c) => (
              <div key={c.label} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                <span>{c.label}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {c.avgDays == null ? "—" : `${c.avgDays} d`}
                  </span>
                  {c.deltaDays != null && c.deltaDays !== 0 && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-xs",
                        c.deltaDays < 0 ? "text-green-700" : "text-critical",
                      )}
                    >
                      {c.deltaDays < 0 ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                      {Math.abs(c.deltaDays)} d MoM
                    </span>
                  )}
                  {c.deltaDays === 0 && <Minus className="size-3 text-muted-foreground" />}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Movement compares this month against last month; fewer days is faster.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      No spend recorded yet.
    </div>
  );
}

// ---------------------------------------------------------------------------
// NDC
// ---------------------------------------------------------------------------

async function NdcDashboard() {
  const { strip, soByStatus, vendorGrades } = await ndcDashboard();
  const groups = await attentionGroups();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {strip.map((m) => (
          <MetricCard key={m.label} m={m} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Supply orders by delivery status</CardTitle></CardHeader>
          <CardContent>
            {soByStatus.every((s) => s.value === 0) ? <EmptyChart /> : <SpendByBarChart data={soByStatus} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Vendor grade summary</CardTitle></CardHeader>
          <CardContent>
            {vendorGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">No graded vendors yet.</p>
            ) : (
              <div className="space-y-2">
                {vendorGrades.map((v) => (
                  <div key={v.grade} className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                    <span>Grade {v.grade}</span>
                    <span className="font-medium tabular-nums">{v.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AttentionPanel groups={groups} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section (Initiator / OC)
// ---------------------------------------------------------------------------

async function SectionDashboard({ user }: { user: CurrentUser }) {
  const data = await sectionDashboard(user);
  const dmy = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">My requisitions ({user.sectionName}, FY {deriveFy()})</CardTitle></CardHeader>
        <CardContent>
          {data.statusCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requisitions this financial year yet.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.statusCounts.map((s) => (
                <Link
                  key={s.status}
                  href={`/requisitions?status=${s.status}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <ReqStatusBadge status={s.status} />
                  <span className="text-lg font-semibold tabular-nums">{s.count}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data.returned.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader><CardTitle className="text-base text-warning">Returned — needs your rework</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.returned.map((r) => (
              <Link key={r.id} href={`/requisitions/${r.id}/edit`} className="block text-sm hover:underline">
                <span className="font-medium">{r.reqNumber.startsWith("DRAFT-") ? "Draft" : r.reqNumber}</span>
                <span className="text-muted-foreground"> — {r.purpose.slice(0, 70)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Deliveries due to my section this week</CardTitle></CardHeader>
          <CardContent>
            {data.dueThisWeek.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries due this week.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.dueThisWeek.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <Link href={`/supply-orders/${d.id}`} className="text-primary hover:underline">
                      {d.soNumber}
                    </Link>
                    <span className="text-muted-foreground">{d.vendor}</span>
                    <Badge className={cn("border-transparent", d.overdue ? "bg-critical text-critical-foreground" : "bg-primary/10 text-primary")}>
                      {d.overdue ? "overdue" : `due ${dmy(d.due)}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {user.role === "OC" && (
          <Card>
            <CardHeader><CardTitle className="text-base">GRNs awaiting my countersignature</CardTitle></CardHeader>
            <CardContent>
              {data.awaitingCountersign.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing awaiting countersignature.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.awaitingCountersign.map((g) => (
                    <li key={g.id}>
                      <Link href={`/grn/${g.id}`} className="text-primary hover:underline">{g.soNumber}</Link>
                      <span className="text-muted-foreground"> — received by {g.receiver} on {dmy(g.receiptDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
