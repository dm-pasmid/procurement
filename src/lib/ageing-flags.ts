import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettingNumbers } from "@/lib/settings";

/**
 * Nightly ageing pass (Vercel cron, with an on-dashboard-load fallback):
 * - GRN_NO_BILL: countersigned GRN whose SO has no bill after GRN_NO_BILL_DAYS
 * - BILL_UNPAID: memo-generated bill without full payment after BILL_UNPAID_DAYS
 * Both WARN; refreshed (not duplicated) while unacknowledged.
 */
export async function runAgeingFlags(): Promise<{
  grnNoBill: number;
  billUnpaid: number;
}> {
  const settings = await getSettingNumbers(["GRN_NO_BILL_DAYS", "BILL_UNPAID_DAYS"]);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let grnNoBill = 0;
  const grnCutoff = new Date(now - settings.GRN_NO_BILL_DAYS * day);
  const grns = await prisma.grn.findMany({
    where: {
      status: "COUNTERSIGNED",
      ocCountersignedAt: { lte: grnCutoff },
      so: { bills: { none: {} } },
    },
    include: { so: true },
  });
  for (const grn of grns) {
    const overdueDays = Math.floor(
      (now - (grn.ocCountersignedAt?.getTime() ?? now)) / day,
    );
    const details = {
      grnNumber: grn.grnNumber,
      soNumber: grn.so.soNumber,
      thresholdDays: settings.GRN_NO_BILL_DAYS,
      daysSinceCountersign: overdueDays,
      note: `Countersigned ${overdueDays} days ago; no bill against ${grn.so.soNumber}`,
    };
    const existing = await prisma.flag.findFirst({
      where: {
        entityType: "Grn",
        entityId: grn.id,
        flagType: "GRN_NO_BILL",
        acknowledgedAt: null,
      },
    });
    if (existing) {
      await prisma.flag.update({ where: { id: existing.id }, data: { details } });
    } else {
      await prisma.flag.create({
        data: {
          entityType: "Grn",
          entityId: grn.id,
          flagType: "GRN_NO_BILL",
          severity: "WARN",
          details,
        },
      });
      grnNoBill += 1;
    }
  }

  let billUnpaid = 0;
  const billCutoff = new Date(now - settings.BILL_UNPAID_DAYS * day);
  const bills = await prisma.bill.findMany({
    where: {
      status: { in: ["MEMO_GENERATED", "PART_PAID"] },
      createdAt: { lte: billCutoff },
    },
    include: { so: true, payments: true },
  });
  for (const bill of bills) {
    const paid = bill.payments.reduce((s, p) => s + Number(p.amountPaid), 0);
    const ageDays = Math.floor((now - bill.createdAt.getTime()) / day);
    const details = {
      bpmNumber: bill.bpmNumber,
      soNumber: bill.so.soNumber,
      netPayable: Number(bill.netPayable),
      paidSoFar: paid,
      thresholdDays: settings.BILL_UNPAID_DAYS,
      ageDays,
      note: `${bill.bpmNumber}: ₹${paid} of ₹${Number(bill.netPayable)} paid after ${ageDays} days`,
    };
    const existing = await prisma.flag.findFirst({
      where: {
        entityType: "Bill",
        entityId: bill.id,
        flagType: "BILL_UNPAID",
        acknowledgedAt: null,
      },
    });
    if (existing) {
      await prisma.flag.update({ where: { id: existing.id }, data: { details } });
    } else {
      await prisma.flag.create({
        data: {
          entityType: "Bill",
          entityId: bill.id,
          flagType: "BILL_UNPAID",
          severity: "WARN",
          details,
        },
      });
      billUnpaid += 1;
    }
  }

  return { grnNoBill, billUnpaid };
}

const LAST_RUN_KEY = "AGEING_LAST_RUN_AT";
const FALLBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Dashboard-load fallback: runs at most every 6 hours. */
export async function runAgeingFlagsThrottled(): Promise<void> {
  const last = await prisma.setting.findUnique({ where: { key: LAST_RUN_KEY } });
  const lastAt = last ? Date.parse(last.value) : 0;
  if (Number.isFinite(lastAt) && Date.now() - lastAt < FALLBACK_INTERVAL_MS) {
    return;
  }
  await prisma.setting.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: new Date().toISOString() },
    create: { key: LAST_RUN_KEY, value: new Date().toISOString() },
  });
  await runAgeingFlags();
}
