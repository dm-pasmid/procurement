import "server-only";
import { admActsForSection } from "@/lib/approval-flow";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * In-app notifications are derived live from workflow state — a notification
 * for "approval pending with you" disappears the moment you approve. Read
 * state is persisted per user in NotificationRead, keyed by a stable notifKey.
 */
export interface NotificationItem {
  key: string;
  title: string;
  href: string;
  at: Date;
  read: boolean;
}

const dmy = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export async function computeNotifications(
  user: Pick<CurrentUser, "id" | "role" | "sectionId">,
): Promise<NotificationItem[]> {
  const raw: Omit<NotificationItem, "read">[] = [];

  // Returned requisitions you raised — need rework.
  const returned = await prisma.requisition.findMany({
    where: { initiatorId: user.id, status: "RETURNED" },
    take: 25,
  });
  for (const r of returned) {
    raw.push({
      key: `req-returned:${r.id}`,
      title: `Requisition ${short(r.reqNumber)} was returned to you for revision.`,
      href: `/requisitions/${r.id}`,
      at: r.updatedAt,
    });
  }

  // Approvals pending with you.
  const pendingStatus =
    user.role === "OC"
      ? "SUBMITTED"
      : user.role === "ADM"
        ? "OC_APPROVED"
        : user.role === "DM"
          ? "ADM_APPROVED"
          : null;
  if (pendingStatus) {
    const pend = await prisma.requisition.findMany({
      where: {
        status: pendingStatus,
        ...(user.role === "OC" ? { sectionId: user.sectionId } : {}),
      },
      include: { section: true },
      take: 50,
    });
    for (const r of pend) {
      if (r.initiatorId === user.id) continue;
      if (user.role === "ADM" && !(await admActsForSection(user.id, r.sectionId))) continue;
      raw.push({
        key: `approval-pending:${r.id}:${r.status}`,
        title: `${r.reqNumber} from ${r.section.name} is pending your approval (since ${dmy(r.updatedAt)}).`,
        href: `/approvals/${r.id}`,
        at: r.updatedAt,
      });
    }
  }

  // OC: GRNs awaiting your countersignature.
  if (user.role === "OC") {
    const grns = await prisma.grn.findMany({
      where: { status: "DRAFT", so: { deliverySectionId: user.sectionId } },
      include: { so: true },
      take: 25,
    });
    for (const g of grns) {
      raw.push({
        key: `grn-countersign:${g.id}`,
        title: `A goods receipt against ${g.so.soNumber} is awaiting your countersignature.`,
        href: `/grn/${g.id}`,
        at: g.receiptDate,
      });
    }
  }

  // Deliveries overdue to your section (Initiator / OC).
  if (user.role === "INITIATOR" || user.role === "OC") {
    const sos = await prisma.supplyOrder.findMany({
      where: { status: "ISSUED", deliverySectionId: user.sectionId, issuedAt: { not: null } },
      take: 50,
    });
    for (const so of sos) {
      const due = so.issuedAt!.getTime() + so.deliveryDays * 86400000;
      if (Date.now() > due) {
        raw.push({
          key: `so-overdue:${so.id}:${daysAgo(new Date(due))}`,
          title: `Delivery on ${so.soNumber} to your section is overdue by ${daysAgo(new Date(due))} day(s).`,
          href: `/supply-orders/${so.id}`,
          at: new Date(due),
        });
      }
    }
  }

  // NDC: procurement idle, SOs overdue, bills awaiting entry, payments pending.
  if (user.role === "NDC") {
    const overdueSos = await prisma.supplyOrder.findMany({
      where: { status: "ISSUED", issuedAt: { not: null } },
      include: { grns: { where: { status: "COUNTERSIGNED" }, select: { id: true }, take: 1 } },
      take: 100,
    });
    for (const so of overdueSos) {
      if (so.grns.length > 0) continue;
      const due = so.issuedAt!.getTime() + so.deliveryDays * 86400000;
      if (Date.now() > due) {
        raw.push({
          key: `so-overdue:${so.id}:${daysAgo(new Date(due))}`,
          title: `Delivery on ${so.soNumber} is overdue by ${daysAgo(new Date(due))} day(s).`,
          href: `/supply-orders/${so.id}`,
          at: new Date(due),
        });
      }
    }
    // Countersigned GRNs whose SO has no bill.
    const grnsNoBill = await prisma.grn.findMany({
      where: { status: "COUNTERSIGNED", so: { bills: { none: {} } } },
      include: { so: true },
      distinct: ["soId"],
      take: 50,
    });
    for (const g of grnsNoBill) {
      raw.push({
        key: `bill-pending:${g.soId}`,
        title: `Goods received on ${g.so.soNumber} but no bill has been entered yet.`,
        href: `/bills/new`,
        at: g.ocCountersignedAt ?? g.receiptDate,
      });
    }
    // Memo-generated bills not fully paid.
    const unpaid = await prisma.bill.findMany({
      where: { status: { in: ["MEMO_GENERATED", "PART_PAID"] } },
      take: 50,
    });
    for (const b of unpaid) {
      raw.push({
        key: `payment-pending:${b.id}:${b.status}`,
        title: `Bill ${short(b.bpmNumber)} is awaiting payment recording.`,
        href: `/bills/${b.id}`,
        at: b.createdAt,
      });
    }
  }

  // Merge read state.
  const reads = await prisma.notificationRead.findMany({
    where: { userId: user.id },
    select: { notifKey: true },
  });
  const readSet = new Set(reads.map((r) => r.notifKey));

  return raw
    .map((n) => ({ ...n, read: readSet.has(n.key) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function unreadNotificationCount(
  user: Pick<CurrentUser, "id" | "role" | "sectionId">,
): Promise<number> {
  const items = await computeNotifications(user);
  return items.filter((n) => !n.read).length;
}

function short(n: string): string {
  return n.startsWith("DRAFT-") ? "(draft)" : n;
}
