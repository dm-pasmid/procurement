import "server-only";
import type { FlagType } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { FLAG_TYPE_LABELS, flagEntityHref, flagNote } from "@/lib/flag-utils";
import { deriveFy } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";
import { fyRange } from "@/lib/registers";
import { getSettingNumber } from "@/lib/settings";
import { scoreVendor } from "@/lib/vendorScore";

const DAY = 86400000;
const money = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Attention Needed — grouped open-flag cards with a human sentence
// ---------------------------------------------------------------------------

export interface AttentionGroup {
  type: FlagType;
  label: string;
  count: number;
  severity: "WARN" | "CRITICAL" | "INFO";
  worstExample: string;
  worstHref: string | null;
  reviewHref: string;
}

const ATTENTION_ORDER: FlagType[] = [
  "SPLITTING_SUSPECT",
  "ESTIMATE_EXCEEDED",
  "PRICE_DEVIATION",
  "QTY_ANOMALY",
  "FREQUENCY_ANOMALY",
  "DUPLICATE_SUSPECT",
  "DELIVERY_OVERDUE",
  "APPROVAL_SLA",
  "GRN_NO_BILL",
  "BILL_UNPAID",
];

export async function attentionGroups(): Promise<AttentionGroup[]> {
  const flags = await prisma.flag.findMany({
    where: { acknowledgedAt: null, severity: { in: ["WARN", "CRITICAL"] } },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });

  const byType = new Map<FlagType, typeof flags>();
  for (const f of flags) {
    const arr = byType.get(f.flagType) ?? [];
    arr.push(f);
    byType.set(f.flagType, arr);
  }

  const groups: AttentionGroup[] = [];
  for (const type of ATTENTION_ORDER) {
    const arr = byType.get(type);
    if (!arr || arr.length === 0) continue;
    const worst = arr[0]; // already severity-then-recency ordered
    groups.push({
      type,
      label: FLAG_TYPE_LABELS[type],
      count: arr.length,
      severity: worst.severity as AttentionGroup["severity"],
      worstExample: flagNote(worst.details),
      worstHref: flagEntityHref(worst.entityType, worst.entityId),
      reviewHref: `/flags`,
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Spend series (recharts)
// ---------------------------------------------------------------------------

export interface Point {
  label: string;
  value: number;
}

export async function monthlySpend12m(): Promise<Point[]> {
  const start = new Date();
  start.setMonth(start.getMonth() - 11, 1);
  start.setHours(0, 0, 0, 0);
  const payments = await prisma.payment.findMany({
    where: { voucherDate: { gte: start } },
    select: { voucherDate: true, amountPaid: true },
  });
  const buckets = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    buckets.set(monthKey(d), 0);
  }
  for (const p of payments) {
    const k = monthKey(p.voucherDate);
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + Number(p.amountPaid));
  }
  return [...buckets.entries()].map(([label, value]) => ({ label, value: money(value) }));
}

export async function spendBySection(fy: string): Promise<Point[]> {
  const { start, end } = fyRange(fy);
  const payments = await prisma.payment.findMany({
    where: { voucherDate: { gte: start, lt: end } },
    select: {
      amountPaid: true,
      bill: { select: { so: { select: { requisition: { select: { section: { select: { name: true } } } } } } } },
    },
  });
  const buckets = new Map<string, number>();
  for (const p of payments) {
    const name = p.bill.so.requisition.section.name;
    buckets.set(name, (buckets.get(name) ?? 0) + Number(p.amountPaid));
  }
  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value: money(value) }))
    .sort((a, b) => b.value - a.value);
}

export async function spendByCategory(fy: string): Promise<Point[]> {
  const { start, end } = fyRange(fy);
  // Attribute paid bills to categories via bill line → SO item → req item → item.
  const bills = await prisma.bill.findMany({
    where: { status: { in: ["PART_PAID", "PAID"] }, createdAt: { gte: start, lt: end } },
    include: {
      items: { include: { soItem: { include: { reqItem: { include: { item: true } } } } } },
    },
  });
  const buckets = new Map<string, number>();
  for (const b of bills) {
    for (const line of b.items) {
      const category = line.soItem.reqItem?.item?.category ?? "Other";
      const gst = 1; // payable amounts already net of GST factor for category view
      const amt = Number(line.payableQty) * Number(line.payableRate) * gst;
      buckets.set(category, (buckets.get(category) ?? 0) + amt);
    }
  }
  return [...buckets.entries()]
    .map(([label, value]) => ({ label, value: money(value) }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Cycle times with month-on-month movement
// ---------------------------------------------------------------------------

export interface CycleStage {
  label: string;
  avgDays: number | null;
  /** thisMonth − lastMonth average (negative = faster). */
  deltaDays: number | null;
  sample: number;
}

export async function cycleTimes(): Promise<CycleStage[]> {
  const sinceStart = new Date();
  sinceStart.setMonth(sinceStart.getMonth() - 13, 1);

  const reqs = await prisma.requisition.findMany({
    where: { createdAt: { gte: sinceStart }, status: { not: "DRAFT" } },
    include: {
      approvalActions: { where: { action: "APPROVE" }, orderBy: { createdAt: "asc" } },
      supplyOrders: {
        include: { grns: { where: { status: "COUNTERSIGNED" }, orderBy: { receiptDate: "desc" } } },
      },
    },
  });
  const bills = await prisma.bill.findMany({
    include: { payments: { orderBy: { voucherDate: "desc" } }, so: { include: { grns: { where: { status: "COUNTERSIGNED" }, orderBy: { receiptDate: "desc" } } } } },
  });

  const submitToApprove: { days: number; at: Date }[] = [];
  const approveToSo: { days: number; at: Date }[] = [];
  const soToReceipt: { days: number; at: Date }[] = [];
  const receiptToPay: { days: number; at: Date }[] = [];

  for (const r of reqs) {
    const finalApprove = r.approvalActions.at(-1);
    if (finalApprove) {
      submitToApprove.push({ days: diffDays(r.createdAt, finalApprove.createdAt), at: finalApprove.createdAt });
      for (const so of r.supplyOrders) {
        if (so.issuedAt) {
          approveToSo.push({ days: diffDays(finalApprove.createdAt, so.issuedAt), at: so.issuedAt });
          const lastGrn = so.grns[0];
          if (lastGrn) soToReceipt.push({ days: diffDays(so.issuedAt, lastGrn.receiptDate), at: lastGrn.receiptDate });
        }
      }
    }
  }
  for (const b of bills) {
    const lastGrn = b.so.grns[0];
    const lastPay = b.payments[0];
    if (lastGrn && lastPay) {
      receiptToPay.push({ days: diffDays(lastGrn.receiptDate, lastPay.voucherDate), at: lastPay.voucherDate });
    }
  }

  return [
    stage("Submission → Approval", submitToApprove),
    stage("Approval → Supply Order", approveToSo),
    stage("Supply Order → Receipt", soToReceipt),
    stage("Receipt → Payment", receiptToPay),
  ];
}

function stage(label: string, rows: { days: number; at: Date }[]): CycleStage {
  if (rows.length === 0) return { label, avgDays: null, deltaDays: null, sample: 0 };
  const avg = rows.reduce((s, r) => s + r.days, 0) / rows.length;
  const now = new Date();
  const thisMonth = rows.filter((r) => sameMonth(r.at, now));
  const lastMonthDate = new Date(now);
  lastMonthDate.setMonth(now.getMonth() - 1);
  const lastMonth = rows.filter((r) => sameMonth(r.at, lastMonthDate));
  let deltaDays: number | null = null;
  if (thisMonth.length > 0 && lastMonth.length > 0) {
    const tm = thisMonth.reduce((s, r) => s + r.days, 0) / thisMonth.length;
    const lm = lastMonth.reduce((s, r) => s + r.days, 0) / lastMonth.length;
    deltaDays = Math.round((tm - lm) * 10) / 10;
  }
  return { label, avgDays: Math.round(avg * 10) / 10, deltaDays, sample: rows.length };
}

// ---------------------------------------------------------------------------
// DM / ADM dashboard
// ---------------------------------------------------------------------------

export interface TopStripMetric {
  label: string;
  value: string;
  href: string;
  hint?: string;
  tone?: "default" | "warning" | "critical";
}

export async function dmAdmTopStrip(user: Pick<CurrentUser, "id" | "role">): Promise<TopStripMetric[]> {
  const billUnpaidDays = await getSettingNumber("BILL_UNPAID_DAYS");
  const pendingStatus = user.role === "ADM" ? "OC_APPROVED" : "ADM_APPROVED";

  const [pending, openProc, issuedSos, unpaidBills, monthPaid] = await Promise.all([
    prisma.requisition.findMany({ where: { status: pendingStatus }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
    prisma.requisition.count({ where: { status: "APPROVED" } }),
    prisma.supplyOrder.findMany({
      where: { status: "ISSUED", issuedAt: { not: null } },
      include: { grns: { where: { status: "COUNTERSIGNED" }, select: { id: true }, take: 1 } },
    }),
    prisma.bill.findMany({
      where: { status: { in: ["MEMO_GENERATED", "PART_PAID"] } },
      select: { createdAt: true },
    }),
    monthToDatePaid(),
  ]);

  const overdue = issuedSos.filter(
    (so) => so.grns.length === 0 && Date.now() > so.issuedAt!.getTime() + so.deliveryDays * DAY,
  ).length;
  const oldest = pending[0] ? Math.floor((Date.now() - pending[0].updatedAt.getTime()) / DAY) : 0;
  const unpaidOverThreshold = unpaidBills.filter(
    (b) => Date.now() - b.createdAt.getTime() > billUnpaidDays * DAY,
  ).length;

  return [
    {
      label: "Pending my approval",
      value: String(pending.length),
      hint: pending.length > 0 ? `oldest ${oldest} day(s)` : undefined,
      href: "/approvals",
      tone: oldest > 2 ? "warning" : "default",
    },
    { label: "Open procurements", value: String(openProc), href: "/procurement-queue" },
    {
      label: "Deliveries overdue",
      value: String(overdue),
      href: "/supply-orders",
      tone: overdue > 0 ? "warning" : "default",
    },
    {
      label: `Bills unpaid > ${billUnpaidDays}d`,
      value: String(unpaidOverThreshold),
      href: "/bills",
      tone: unpaidOverThreshold > 0 ? "critical" : "default",
    },
    { label: "Paid this month", value: inrShort(monthPaid), href: "/payments" },
  ];
}

async function monthToDatePaid(): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const agg = await prisma.payment.aggregate({
    where: { voucherDate: { gte: start } },
    _sum: { amountPaid: true },
  });
  return Number(agg._sum.amountPaid ?? 0);
}

// ---------------------------------------------------------------------------
// NDC dashboard
// ---------------------------------------------------------------------------

export async function ndcDashboard(): Promise<{
  strip: TopStripMetric[];
  soByStatus: Point[];
  vendorGrades: { grade: string; count: number }[];
}> {
  const idleDays = await getSettingNumber("PROC_IDLE_DAYS");
  const [queue, sos, grnsNoBill, paymentsPending, vendors] = await Promise.all([
    prisma.requisition.findMany({ where: { status: "APPROVED" }, select: { updatedAt: true } }),
    prisma.supplyOrder.findMany({
      where: { status: { in: ["ISSUED", "CLOSED", "SHORT_CLOSED"] }, issuedAt: { not: null } },
      include: { grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } }, items: true },
    }),
    prisma.grn.findMany({ where: { status: "COUNTERSIGNED", so: { bills: { none: {} } } }, distinct: ["soId"], select: { id: true } }),
    prisma.bill.count({ where: { status: { in: ["MEMO_GENERATED", "PART_PAID"] } } }),
    prisma.vendor.findMany({ where: { supplyOrders: { some: { status: { notIn: ["DRAFT", "CANCELLED"] } } } }, select: { id: true } }),
  ]);

  const idle = queue.filter((r) => Date.now() - r.updatedAt.getTime() > idleDays * DAY).length;

  const statusBuckets = { Awaiting: 0, "Partially received": 0, Received: 0, Overdue: 0 };
  for (const so of sos) {
    const received = so.items.every((l) => {
      const rec = so.grns.reduce((s, g) => s + g.items.filter((x) => x.soItemId === l.id).reduce((a, x) => a + Number(x.qtyReceived), 0), 0);
      return rec >= Number(l.qty) - 1e-9;
    });
    const any = so.grns.length > 0;
    if (so.status !== "ISSUED") { statusBuckets.Received++; continue; }
    if (received && any) statusBuckets.Received++;
    else if (any) statusBuckets["Partially received"]++;
    else if (Date.now() > so.issuedAt!.getTime() + so.deliveryDays * DAY) statusBuckets.Overdue++;
    else statusBuckets.Awaiting++;
  }

  const gradeCounts = new Map<string, number>();
  for (const v of vendors) {
    const s = await scoreVendor(v.id);
    const g = s.grade ?? "—";
    gradeCounts.set(g, (gradeCounts.get(g) ?? 0) + 1);
  }

  return {
    strip: [
      { label: "Queue idle", value: String(idle), hint: `> ${idleDays} days`, href: "/procurement-queue", tone: idle > 0 ? "warning" : "default" },
      { label: "Bills to enter", value: String(grnsNoBill.length), href: "/bills/new", tone: grnsNoBill.length > 0 ? "warning" : "default" },
      { label: "Payments pending", value: String(paymentsPending), href: "/bills" },
      { label: "Open procurements", value: String(queue.length), href: "/procurement-queue" },
    ],
    soByStatus: Object.entries(statusBuckets).map(([label, value]) => ({ label, value })),
    vendorGrades: [...gradeCounts.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => a.grade.localeCompare(b.grade)),
  };
}

// ---------------------------------------------------------------------------
// Section dashboard (Initiator / OC)
// ---------------------------------------------------------------------------

export async function sectionDashboard(user: Pick<CurrentUser, "id" | "role" | "sectionId">) {
  const fy = deriveFy();
  const [myReqs, deliveries, awaitingCountersign, returned] = await Promise.all([
    prisma.requisition.groupBy({
      by: ["status"],
      where: { sectionId: user.sectionId, fy },
      _count: { _all: true },
    }),
    prisma.supplyOrder.findMany({
      where: { status: "ISSUED", deliverySectionId: user.sectionId, issuedAt: { not: null } },
      include: { vendor: true },
    }),
    user.role === "OC"
      ? prisma.grn.findMany({ where: { status: "DRAFT", so: { deliverySectionId: user.sectionId } }, include: { so: true, receiver: true } })
      : Promise.resolve([]),
    prisma.requisition.findMany({ where: { sectionId: user.sectionId, status: "RETURNED" }, take: 20 }),
  ]);

  const weekEnd = Date.now() + 7 * DAY;
  const dueThisWeek = deliveries
    .map((so) => ({ so, due: so.issuedAt!.getTime() + so.deliveryDays * DAY }))
    .filter((x) => x.due <= weekEnd)
    .sort((a, b) => a.due - b.due);

  return {
    statusCounts: myReqs.map((g) => ({ status: g.status, count: g._count._all })),
    dueThisWeek: dueThisWeek.map((x) => ({
      id: x.so.id,
      soNumber: x.so.soNumber,
      vendor: x.so.vendor.name,
      due: new Date(x.due),
      overdue: x.due < Date.now(),
    })),
    awaitingCountersign: awaitingCountersign.map((g) => ({
      id: g.id,
      soNumber: g.so.soNumber,
      receiver: g.receiver.name,
      receiptDate: g.receiptDate,
    })),
    returned: returned.map((r) => ({ id: r.id, reqNumber: r.reqNumber, purpose: r.purpose })),
  };
}

// ---------------------------------------------------------------------------

function monthKey(d: Date): string {
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
function diffDays(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY));
}
function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function inrShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
