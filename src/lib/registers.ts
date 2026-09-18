import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { REQ_STATUS_LABELS } from "@/components/req-status-badge";
import { FLAG_TYPE_LABELS } from "@/lib/flag-utils";
import { prisma } from "@/lib/prisma";
import { scoreVendor } from "@/lib/vendorScore";

/** A register a party can be asked to produce, generated live from data. */
export type RegisterKey =
  | "requisition"
  | "supply-order"
  | "grn"
  | "bill"
  | "vendor-ledger"
  | "section-expenditure"
  | "deviation";

export interface RegisterColumn {
  key: string;
  label: string;
  numeric?: boolean;
  /** Excel/PDF column width hint (characters). */
  width?: number;
}

export interface RegisterMeta {
  key: RegisterKey;
  title: string;
  /** True when OC / INITIATOR may view a section-scoped slice. */
  sectionScopable: boolean;
  /** Roles allowed the full, all-section view. */
  fullRoles: Role[];
}

export const REGISTERS: RegisterMeta[] = [
  { key: "requisition", title: "Requisition Register", sectionScopable: true, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "supply-order", title: "Supply Order Register", sectionScopable: true, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "grn", title: "GRN Register", sectionScopable: true, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "bill", title: "Bill Register", sectionScopable: true, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "vendor-ledger", title: "Vendor Ledger", sectionScopable: false, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "section-expenditure", title: "Section-wise Expenditure", sectionScopable: true, fullRoles: ["NDC", "ADM", "DM"] },
  { key: "deviation", title: "Deviation Register", sectionScopable: false, fullRoles: ["NDC", "ADM", "DM"] },
];

/** Registers a role may open (own-section for OC/INITIATOR). */
export function registersForRole(role: Role): RegisterMeta[] {
  if (role === "OC" || role === "INITIATOR") {
    return REGISTERS.filter((r) => r.sectionScopable);
  }
  return REGISTERS.filter((r) => r.fullRoles.includes(role));
}

export function registerMeta(key: string): RegisterMeta | undefined {
  return REGISTERS.find((r) => r.key === key);
}

export interface RegisterResult {
  title: string;
  fy: string;
  columns: RegisterColumn[];
  rows: Record<string, string | number>[];
  /** Whether the caller sees only their own section. */
  sectionScoped: boolean;
}

export interface RegisterQuery {
  role: Role;
  sectionId: string;
  fy: string;
  /** Register-specific filters from the query string. */
  filters: Record<string, string | undefined>;
}

/** Financial year (April–March) date range for `fy` like "2026-27". */
export function fyRange(fy: string): { start: Date; end: Date } {
  const startYear = Number(fy.slice(0, 4));
  return {
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    end: new Date(Date.UTC(startYear + 1, 3, 1, 0, 0, 0)),
  };
}

/** Distinct FYs present across requisitions/SOs, newest first. */
export async function availableFys(sectionId?: string): Promise<string[]> {
  const reqs = await prisma.requisition.findMany({
    where: sectionId ? { sectionId } : undefined,
    select: { fy: true },
    distinct: ["fy"],
    orderBy: { fy: "desc" },
  });
  const fys = reqs.map((r) => r.fy);
  const current = deriveFyForList();
  if (!fys.includes(current)) fys.unshift(current);
  return fys;
}

function deriveFyForList(date = new Date()): string {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

const isSectionScoped = (role: Role) => role === "OC" || role === "INITIATOR";

const money = (n: Prisma.Decimal | number | null | undefined) =>
  n == null ? 0 : Math.round(Number(n) * 100) / 100;

const truncate = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const dmy = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function loadRegister(
  key: RegisterKey,
  q: RegisterQuery,
): Promise<RegisterResult> {
  switch (key) {
    case "requisition":
      return requisitionRegister(q);
    case "supply-order":
      return supplyOrderRegister(q);
    case "grn":
      return grnRegister(q);
    case "bill":
      return billRegister(q);
    case "vendor-ledger":
      return vendorLedger(q);
    case "section-expenditure":
      return sectionExpenditure(q);
    case "deviation":
      return deviationRegister(q);
  }
}

// ---------------------------------------------------------------------------
// 1. Requisition Register
// ---------------------------------------------------------------------------

async function requisitionRegister(q: RegisterQuery): Promise<RegisterResult> {
  const scoped = isSectionScoped(q.role);
  const where: Prisma.RequisitionWhereInput = { fy: q.fy };
  if (scoped) where.sectionId = q.sectionId;
  if (q.filters.status && q.filters.status in REQ_STATUS_LABELS) {
    where.status = q.filters.status as Prisma.RequisitionWhereInput["status"];
  }

  const reqs = await prisma.requisition.findMany({
    where,
    include: {
      section: true,
      approvalActions: { where: { action: "APPROVE" }, include: { actor: true } },
      _count: { select: { items: true } },
    },
    orderBy: { reqNumber: "asc" },
  });
  const flagCounts = await flagCountByEntity("Requisition", reqs.map((r) => r.id));

  const approvalAt = (
    r: (typeof reqs)[number],
    level: "OC" | "ADM" | "DM",
  ): string => {
    const a = r.approvalActions.find((x) => x.level === level);
    return a ? `${dmy(a.createdAt)} — ${a.actor.name}` : "";
  };

  return {
    title: "Requisition Register",
    fy: q.fy,
    sectionScoped: scoped,
    columns: [
      { key: "reqNumber", label: "Number", width: 22 },
      { key: "date", label: "Date", width: 14 },
      { key: "section", label: "Section", width: 16 },
      { key: "purpose", label: "Purpose", width: 40 },
      { key: "estimate", label: "Estimate", numeric: true, width: 14 },
      { key: "sanction", label: "Sanction", numeric: true, width: 14 },
      { key: "oc", label: "OC approval", width: 24 },
      { key: "adm", label: "ADM approval", width: 24 },
      { key: "dm", label: "DM approval", width: 24 },
      { key: "status", label: "Status", width: 18 },
      { key: "flags", label: "Flags", numeric: true, width: 8 },
    ],
    rows: reqs.map((r) => ({
      reqNumber: r.reqNumber.startsWith("DRAFT-") ? "(draft)" : r.reqNumber,
      date: dmy(r.createdAt),
      section: r.section.name,
      purpose: truncate(r.purpose),
      estimate: money(r.estimatedTotal),
      sanction: money(r.sanctionedTotal),
      oc: approvalAt(r, "OC"),
      adm: approvalAt(r, "ADM"),
      dm: approvalAt(r, "DM"),
      status: REQ_STATUS_LABELS[r.status],
      flags: flagCounts.get(r.id) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// 2. Supply Order Register
// ---------------------------------------------------------------------------

async function supplyOrderRegister(q: RegisterQuery): Promise<RegisterResult> {
  const scoped = isSectionScoped(q.role);
  const where: Prisma.SupplyOrderWhereInput = { fy: q.fy };
  if (scoped) where.requisition = { sectionId: q.sectionId };
  if (q.filters.status) {
    where.status = q.filters.status as Prisma.SupplyOrderWhereInput["status"];
  }

  const orders = await prisma.supplyOrder.findMany({
    where,
    include: {
      requisition: true,
      vendor: true,
      procurement: true,
      items: true,
      grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
    },
    orderBy: { soNumber: "asc" },
  });

  const procRef = (o: (typeof orders)[number]): string => {
    const p = o.procurement;
    if (p.mode === "TENDER") return `NIT ${p.nitNumber ?? "—"}${p.nitDate ? " / " + dmy(p.nitDate) : ""}`;
    if (p.mode === "EMPANELLED") return `Empanel. ${o.vendor.empanelmentRef ?? "—"}`;
    return `GeM ${p.gemOrderRef ?? "—"}`;
  };
  const deliveryStatus = (o: (typeof orders)[number]): string => {
    if (o.status === "SHORT_CLOSED") return "Short closed";
    if (o.status === "CANCELLED") return "Cancelled";
    const receivedAll = o.items.every((l) => {
      const rec = o.grns.reduce(
        (s, g) => s + g.items.filter((x) => x.soItemId === l.id).reduce((a, x) => a + Number(x.qtyReceived), 0),
        0,
      );
      return rec >= Number(l.qty) - 1e-9;
    });
    if (receivedAll && o.grns.length > 0) return "Received";
    if (o.grns.length > 0) return "Partially received";
    if (o.status === "ISSUED" && o.issuedAt) {
      const due = o.issuedAt.getTime() + o.deliveryDays * 86400000;
      return Date.now() > due ? "Overdue" : "Awaiting";
    }
    return o.status;
  };
  const dueDate = (o: (typeof orders)[number]) =>
    o.issuedAt ? dmy(new Date(o.issuedAt.getTime() + o.deliveryDays * 86400000)) : "";

  return {
    title: "Supply Order Register",
    fy: q.fy,
    sectionScoped: scoped,
    columns: [
      { key: "soNumber", label: "SO Number", width: 22 },
      { key: "date", label: "Date", width: 14 },
      { key: "requisition", label: "Requisition", width: 22 },
      { key: "vendor", label: "Vendor", width: 26 },
      { key: "mode", label: "Mode", width: 12 },
      { key: "ref", label: "Reference", width: 24 },
      { key: "value", label: "Value (incl. GST)", numeric: true, width: 16 },
      { key: "due", label: "Delivery due", width: 14 },
      { key: "delivery", label: "Delivery status", width: 18 },
      { key: "version", label: "Version", numeric: true, width: 8 },
    ],
    rows: orders.map((o) => ({
      soNumber: o.soNumber.startsWith("DRAFT-") ? "(draft)" : o.soNumber,
      date: dmy(o.issuedAt),
      requisition: o.requisition.reqNumber,
      vendor: o.vendor.name,
      mode: o.procurement.mode,
      ref: procRef(o),
      value: money(
        o.items.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.gstPercent) / 100), 0),
      ),
      due: dueDate(o),
      delivery: deliveryStatus(o),
      version: o.version,
    })),
  };
}

// ---------------------------------------------------------------------------
// 3. GRN Register
// ---------------------------------------------------------------------------

async function grnRegister(q: RegisterQuery): Promise<RegisterResult> {
  const scoped = isSectionScoped(q.role);
  const where: Prisma.GrnWhereInput = { so: { fy: q.fy } };
  if (scoped) where.so = { fy: q.fy, deliverySectionId: q.sectionId };
  if (q.filters.status) {
    where.status = q.filters.status as Prisma.GrnWhereInput["status"];
  }

  const grns = await prisma.grn.findMany({
    where,
    include: {
      so: { include: { deliverySection: true } },
      items: true,
      ocCountersignedBy: true,
      receiver: true,
    },
    orderBy: [{ ocCountersignedAt: "asc" }, { receiptDate: "asc" }],
  });

  return {
    title: "GRN Register",
    fy: q.fy,
    sectionScoped: scoped,
    columns: [
      { key: "grnNumber", label: "GRN Number", width: 22 },
      { key: "date", label: "Receipt date", width: 14 },
      { key: "so", label: "Supply Order", width: 22 },
      { key: "challan", label: "Challan", width: 22 },
      { key: "section", label: "Section", width: 16 },
      { key: "accepted", label: "Accepted qty", numeric: true, width: 12 },
      { key: "rejected", label: "Rejected qty", numeric: true, width: 12 },
      { key: "status", label: "Status", width: 16 },
      { key: "oc", label: "Countersigned by", width: 22 },
    ],
    rows: grns.map((g) => ({
      grnNumber: g.grnNumber.startsWith("DRAFT-") ? "(draft)" : g.grnNumber,
      date: dmy(g.receiptDate),
      so: g.so.soNumber,
      challan: `${g.challanNumber} / ${dmy(g.challanDate)}`,
      section: g.so.deliverySection.name,
      accepted: g.items.reduce((s, i) => s + Number(i.qtyAccepted), 0),
      rejected: g.items.reduce((s, i) => s + Number(i.qtyRejected), 0),
      status: g.status === "COUNTERSIGNED" ? "Countersigned" : "Draft",
      oc: g.ocCountersignedBy?.name ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// 4. Bill Register
// ---------------------------------------------------------------------------

async function billRegister(q: RegisterQuery): Promise<RegisterResult> {
  const scoped = isSectionScoped(q.role);
  const where: Prisma.BillWhereInput = { so: { fy: q.fy } };
  if (scoped) where.so = { fy: q.fy, requisition: { sectionId: q.sectionId } };
  if (q.filters.status) {
    where.status = q.filters.status as Prisma.BillWhereInput["status"];
  }

  const bills = await prisma.bill.findMany({
    where,
    include: {
      so: { include: { vendor: true } },
      payments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const BILL_STATUS: Record<string, string> = {
    ENTERED: "Entered",
    MEMO_GENERATED: "Memo generated",
    PART_PAID: "Part paid",
    PAID: "Paid",
  };

  return {
    title: "Bill Register",
    fy: q.fy,
    sectionScoped: scoped,
    columns: [
      { key: "bpmNumber", label: "BPM Number", width: 22 },
      { key: "vendorBill", label: "Vendor bill", width: 20 },
      { key: "so", label: "Supply Order", width: 22 },
      { key: "vendor", label: "Vendor", width: 24 },
      { key: "claimed", label: "Claimed", numeric: true, width: 14 },
      { key: "computed", label: "Computed payable", numeric: true, width: 16 },
      { key: "deductions", label: "Deductions", numeric: true, width: 14 },
      { key: "net", label: "Net payable", numeric: true, width: 14 },
      { key: "paid", label: "Paid", numeric: true, width: 14 },
      { key: "vouchers", label: "Vouchers", width: 22 },
      { key: "status", label: "Status", width: 16 },
    ],
    rows: bills.map((b) => ({
      bpmNumber: b.bpmNumber.startsWith("DRAFT-") ? "(pending)" : b.bpmNumber,
      vendorBill: `${b.vendorBillNumber} / ${dmy(b.vendorBillDate)}`,
      so: b.so.soNumber,
      vendor: b.so.vendor.name,
      claimed: money(b.claimedAmount),
      computed: money(b.computedPayable),
      deductions: money(b.deductionsTotal),
      net: money(b.netPayable),
      paid: money(b.payments.reduce((s, p) => s + Number(p.amountPaid), 0)),
      vouchers: b.payments.map((p) => p.voucherNumber).join(", "),
      status: BILL_STATUS[b.status],
    })),
  };
}

// ---------------------------------------------------------------------------
// 5. Vendor Ledger
// ---------------------------------------------------------------------------

async function vendorLedger(q: RegisterQuery): Promise<RegisterResult> {
  const { start, end } = fyRange(q.fy);
  const vendors = await prisma.vendor.findMany({
    where: {
      supplyOrders: {
        some: { fy: q.fy, status: { notIn: ["DRAFT", "CANCELLED"] } },
      },
    },
    include: {
      supplyOrders: {
        where: { fy: q.fy, status: { notIn: ["DRAFT", "CANCELLED"] } },
        include: { items: true, bills: { include: { payments: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: Record<string, string | number>[] = [];
  for (const v of vendors) {
    const suppliedValue = v.supplyOrders.reduce(
      (s, o) => s + o.items.reduce((a, l) => a + Number(l.qty) * Number(l.rate) * (1 + Number(l.gstPercent) / 100), 0),
      0,
    );
    const bills = v.supplyOrders.flatMap((o) => o.bills);
    const paid = bills.reduce(
      (s, b) => s + b.payments.reduce((a, p) => (p.voucherDate >= start && p.voucherDate < end ? a + Number(p.amountPaid) : a), 0),
      0,
    );
    const score = await scoreVendor(v.id);
    rows.push({
      vendor: v.name,
      empanelled: v.empanelled ? "Yes" : "No",
      sos: v.supplyOrders.length,
      supplied: money(suppliedValue),
      rejection: score.rejectionRatePct == null ? "—" : `${score.rejectionRatePct}%`,
      bills: bills.length,
      paid: money(paid),
      avgDelay: score.avgDelayDays == null ? "—" : `${score.avgDelayDays}`,
      grade: score.grade ?? "—",
    });
  }

  return {
    title: "Vendor Ledger",
    fy: q.fy,
    sectionScoped: false,
    columns: [
      { key: "vendor", label: "Vendor", width: 28 },
      { key: "empanelled", label: "Empanelled", width: 12 },
      { key: "sos", label: "SOs", numeric: true, width: 8 },
      { key: "supplied", label: "Supplied value", numeric: true, width: 16 },
      { key: "rejection", label: "Rejection rate", width: 14 },
      { key: "bills", label: "Bills", numeric: true, width: 8 },
      { key: "paid", label: "Paid (₹)", numeric: true, width: 16 },
      { key: "avgDelay", label: "Avg delay (days)", width: 14 },
      { key: "grade", label: "Grade", width: 8 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 6. Section-wise Expenditure
// ---------------------------------------------------------------------------

async function sectionExpenditure(q: RegisterQuery): Promise<RegisterResult> {
  const scoped = isSectionScoped(q.role);
  const sections = await prisma.section.findMany({
    where: scoped ? { id: q.sectionId } : undefined,
    orderBy: { name: "asc" },
  });
  const { start, end } = fyRange(q.fy);

  const rows: Record<string, string | number>[] = [];
  for (const s of sections) {
    const reqs = await prisma.requisition.findMany({
      where: { fy: q.fy, sectionId: s.id },
      include: {
        items: { include: { item: true } },
        supplyOrders: { include: { bills: { include: { payments: true } } } },
      },
    });
    if (reqs.length === 0 && scoped === false) continue;

    const approved = reqs.filter((r) =>
      ["APPROVED", "IN_PROCUREMENT", "SO_ISSUED", "PARTIALLY_RECEIVED", "RECEIVED", "BILL_UNDER_PROCESS", "CLOSED"].includes(r.status),
    ).length;
    const rejected = reqs.filter((r) => r.status === "REJECTED").length;
    const sanctioned = reqs.reduce((sum, r) => sum + money(r.sanctionedTotal), 0);
    const paid = reqs.reduce(
      (sum, r) =>
        sum +
        r.supplyOrders.reduce(
          (a, o) =>
            a +
            o.bills.reduce(
              (b, bill) =>
                b + bill.payments.reduce((p, pay) => (pay.voucherDate >= start && pay.voucherDate < end ? p + Number(pay.amountPaid) : p), 0),
              0,
            ),
          0,
        ),
      0,
    );
    // Top items by estimated spend within the FY.
    const spendByItem = new Map<string, number>();
    for (const r of reqs) {
      for (const l of r.items) {
        const name = l.item?.name ?? l.itemNameFree ?? "—";
        spendByItem.set(name, (spendByItem.get(name) ?? 0) + Number(l.qty) * Number(l.estRate));
      }
    }
    const topItems = [...spendByItem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join(", ");

    rows.push({
      section: s.name,
      raised: reqs.length,
      approved,
      rejected,
      sanctioned: money(sanctioned),
      paid: money(paid),
      topItems: topItems || "—",
    });
  }

  return {
    title: "Section-wise Expenditure",
    fy: q.fy,
    sectionScoped: scoped,
    columns: [
      { key: "section", label: "Section", width: 20 },
      { key: "raised", label: "Requisitions raised", numeric: true, width: 12 },
      { key: "approved", label: "Approved", numeric: true, width: 10 },
      { key: "rejected", label: "Rejected", numeric: true, width: 10 },
      { key: "sanctioned", label: "Sanctioned (₹)", numeric: true, width: 16 },
      { key: "paid", label: "Actual paid (₹)", numeric: true, width: 16 },
      { key: "topItems", label: "Top items by spend", width: 40 },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// 7. Deviation Register
// ---------------------------------------------------------------------------

async function deviationRegister(q: RegisterQuery): Promise<RegisterResult> {
  const { start, end } = fyRange(q.fy);
  const where: Prisma.FlagWhereInput = { createdAt: { gte: start, lt: end } };
  if (q.filters.type && q.filters.type in FLAG_TYPE_LABELS) {
    where.flagType = q.filters.type as Prisma.FlagWhereInput["flagType"];
  }
  if (q.filters.severity) {
    where.severity = q.filters.severity as Prisma.FlagWhereInput["severity"];
  }

  const flags = await prisma.flag.findMany({
    where,
    include: { acknowledgedBy: true },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
  });

  const entityRef = (f: (typeof flags)[number]): string => {
    const d = (f.details ?? {}) as Record<string, unknown>;
    const num = d.reqNumber ?? d.soNumber ?? d.grnNumber ?? d.bpmNumber;
    return typeof num === "string" ? num : `${f.entityType}`;
  };
  const detailSummary = (f: (typeof flags)[number]): string => {
    const d = (f.details ?? {}) as Record<string, unknown>;
    if (typeof d.note === "string") return d.note;
    if (typeof d.bannerText === "string") return d.bannerText;
    if (Array.isArray(d.messages)) return d.messages.filter((m) => typeof m === "string").join("; ");
    return "";
  };

  return {
    title: "Deviation Register",
    fy: q.fy,
    sectionScoped: false,
    columns: [
      { key: "type", label: "Type", width: 20 },
      { key: "severity", label: "Severity", width: 10 },
      { key: "entity", label: "Entity", width: 22 },
      { key: "details", label: "Details", width: 48 },
      { key: "raised", label: "Raised", width: 14 },
      { key: "ack", label: "Acknowledged", width: 26 },
      { key: "remarks", label: "Ack. remarks", width: 30 },
    ],
    rows: flags.map((f) => ({
      type: FLAG_TYPE_LABELS[f.flagType],
      severity: f.severity,
      entity: entityRef(f),
      details: truncate(detailSummary(f), 90),
      raised: dmy(f.createdAt),
      ack: f.acknowledgedAt ? `${f.acknowledgedBy?.name ?? ""} · ${dmy(f.acknowledgedAt)}` : "Open",
      remarks: f.acknowledgeRemarks ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------

async function flagCountByEntity(
  entityType: string,
  entityIds: string[],
): Promise<Map<string, number>> {
  if (entityIds.length === 0) return new Map();
  const grouped = await prisma.flag.groupBy({
    by: ["entityId"],
    where: { entityType, entityId: { in: entityIds } },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.entityId, g._count._all]));
}
