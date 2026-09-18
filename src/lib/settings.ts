import "server-only";
import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, number> = {
  ADM_LIMIT: 20000,
  EST_TOLERANCE_PCT: 10,
  SPLIT_WINDOW_DAYS: 30,
  PRICE_DEV_PCT: 15,
  FREQ_COUNT: 3,
  FREQ_WINDOW_DAYS: 90,
  APPROVAL_SLA_HOURS: 48,
  PROC_IDLE_DAYS: 7,
  GRN_NO_BILL_DAYS: 30,
  BILL_UNPAID_DAYS: 30,
  QTY_MULTIPLIER: 2,
};

export async function getSettingNumber(key: string): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : (DEFAULTS[key] ?? NaN);
}

export async function getSettingNumbers(
  keys: string[],
): Promise<Record<string, number>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return Object.fromEntries(
    keys.map((k) => {
      const v = byKey.get(k);
      return [k, v !== undefined && Number.isFinite(v) ? v : (DEFAULTS[k] ?? NaN)];
    }),
  );
}
