import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Vendor performance scoring — suggestive only, never blocks selection.
 * Reused by the procurement vendor card and later by registers/reports.
 *
 * Grade:
 *  A — no delivery delays and no rejections in the last 12 months
 *  B — minor: average delay ≤ 7 days and rejection rate ≤ 5%
 *  C — repeated/major: average delay > 7 days or rejection rate > 5%
 *  null — no completed orders in the window (new vendor)
 */

export interface VendorScore {
  vendorId: string;
  orders12m: number;
  /** Average days beyond the SO delivery period; null when no receipts. */
  avgDelayDays: number | null;
  /** Rejected qty as % of received qty across GRNs; null when no receipts. */
  rejectionRatePct: number | null;
  grade: "A" | "B" | "C" | null;
}

export async function scoreVendor(vendorId: string): Promise<VendorScore> {
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const orders = await prisma.supplyOrder.findMany({
    where: {
      vendorId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      OR: [{ issuedAt: { gte: yearAgo } }, { issuedAt: null }],
    },
    include: {
      grns: { include: { items: true }, orderBy: { receiptDate: "desc" } },
    },
  });

  let delaySum = 0;
  let delayCount = 0;
  let received = 0;
  let rejected = 0;

  for (const so of orders) {
    if (so.issuedAt && so.grns.length > 0) {
      const lastReceipt = so.grns[0].receiptDate;
      const elapsedDays =
        (lastReceipt.getTime() - so.issuedAt.getTime()) / (24 * 60 * 60 * 1000);
      delaySum += Math.max(0, elapsedDays - so.deliveryDays);
      delayCount += 1;
    }
    for (const grn of so.grns) {
      for (const line of grn.items) {
        received += Number(line.qtyReceived);
        rejected += Number(line.qtyRejected);
      }
    }
  }

  const avgDelayDays = delayCount > 0 ? delaySum / delayCount : null;
  const rejectionRatePct = received > 0 ? (rejected / received) * 100 : null;

  let grade: VendorScore["grade"] = null;
  if (orders.length > 0) {
    const delay = avgDelayDays ?? 0;
    const rejection = rejectionRatePct ?? 0;
    if (delay === 0 && rejection === 0) grade = "A";
    else if (delay <= 7 && rejection <= 5) grade = "B";
    else grade = "C";
  }

  return {
    vendorId,
    orders12m: orders.length,
    avgDelayDays:
      avgDelayDays !== null ? Math.round(avgDelayDays * 10) / 10 : null,
    rejectionRatePct:
      rejectionRatePct !== null
        ? Math.round(rejectionRatePct * 10) / 10
        : null,
    grade,
  };
}

export async function scoreVendors(
  vendorIds: string[],
): Promise<Record<string, VendorScore>> {
  const entries = await Promise.all(
    vendorIds.map(async (id) => [id, await scoreVendor(id)] as const),
  );
  return Object.fromEntries(entries);
}
