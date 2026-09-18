import "server-only";
import type { Flag } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettingNumbers } from "@/lib/settings";

/**
 * Smart Checks — suggestive integrity panel computed at render time on every
 * approval screen. WARN flags (price/qty/frequency) are created on first
 * render, once per requisition per type. Nothing here blocks approval.
 */

export interface SmartCheckRow {
  severity: "OK" | "INFO" | "WARN" | "CRITICAL";
  category: string;
  message: string;
}

export interface SmartChecksResult {
  rows: SmartCheckRow[];
  /** Unacknowledged WARN/CRITICAL flags — approving requires the ack tick. */
  unacknowledgedFlags: Flag[];
  splittingBanner: string | null;
}

const inr = new Intl.NumberFormat("en-IN");

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10];
  return `${n}${suffix}`;
}

export async function computeSmartChecks(
  requisitionId: string,
): Promise<SmartChecksResult> {
  const settings = await getSettingNumbers([
    "PRICE_DEV_PCT",
    "QTY_MULTIPLIER",
    "FREQ_COUNT",
    "FREQ_WINDOW_DAYS",
  ]);

  const req = await prisma.requisition.findUniqueOrThrow({
    where: { id: requisitionId },
    include: { items: { include: { item: true } } },
  });

  const rows: SmartCheckRow[] = [];
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const freqSince = new Date(
    Date.now() - settings.FREQ_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const priceMessages: string[] = [];
  const qtyMessages: string[] = [];
  const freqMessages: string[] = [];

  for (const line of req.items) {
    const label = line.item?.name ?? line.itemNameFree ?? "item";
    const estRate = Number(line.estRate);

    // ---- price check: estRate vs LPR / 12-month avg ----
    if (line.item) {
      const lpr = line.item.lastPurchaseRate
        ? Number(line.item.lastPurchaseRate)
        : null;
      const avg = line.item.avgRate12m ? Number(line.item.avgRate12m) : null;
      const baseline = lpr ?? avg;
      if (baseline && baseline > 0) {
        const devPct = ((estRate - baseline) / baseline) * 100;
        if (devPct > settings.PRICE_DEV_PCT) {
          const baselineLabel = lpr
            ? `last purchase rate ₹${inr.format(lpr)}${
                line.item.lastPurchaseDate
                  ? ` (${line.item.lastPurchaseDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })})`
                  : ""
              }`
            : `12-month average ₹${inr.format(avg!)}`;
          priceMessages.push(
            `${label}: ₹${inr.format(estRate)}/unit is ${Math.round(devPct)}% above ${baselineLabel}`,
          );
        }
      }
    }

    if (line.itemId) {
      // ---- quantity check vs section's 12-month average ----
      const history = await prisma.requisitionItem.findMany({
        where: {
          itemId: line.itemId,
          requisitionId: { not: req.id },
          requisition: {
            sectionId: req.sectionId,
            status: { notIn: ["DRAFT", "REJECTED"] },
            createdAt: { gte: yearAgo },
          },
        },
        select: { qty: true, requisitionId: true, requisition: { select: { createdAt: true } } },
      });
      if (history.length > 0) {
        const avgQty =
          history.reduce((s, h) => s + Number(h.qty), 0) / history.length;
        if (avgQty > 0 && Number(line.qty) > settings.QTY_MULTIPLIER * avgQty) {
          qtyMessages.push(
            `${label}: section usually indents ~${Math.round(avgQty)} ${line.unit}; this asks ${Number(line.qty)}`,
          );
        }

        // ---- frequency check within FREQ_WINDOW_DAYS ----
        const inWindow = new Set(
          history
            .filter((h) => h.requisition.createdAt >= freqSince)
            .map((h) => h.requisitionId),
        );
        const nth = inWindow.size + 1; // including this one
        if (nth >= settings.FREQ_COUNT) {
          freqMessages.push(
            `${ordinal(nth)} indent for ${label} in ${settings.FREQ_WINDOW_DAYS} days`,
          );
        }
      }
    }
  }

  // ---- persist WARN flags on first render (once per type per requisition) ----
  await ensureFlag(req.id, "PRICE_DEVIATION", priceMessages);
  await ensureFlag(req.id, "QTY_ANOMALY", qtyMessages);
  await ensureFlag(req.id, "FREQUENCY_ANOMALY", freqMessages);

  priceMessages.forEach((m) => rows.push({ severity: "WARN", category: "Price", message: m }));
  qtyMessages.forEach((m) => rows.push({ severity: "WARN", category: "Quantity", message: m }));
  freqMessages.forEach((m) => rows.push({ severity: "WARN", category: "Frequency", message: m }));

  // ---- flags from earlier steps (splitting, duplicates) ----
  const allFlags = await prisma.flag.findMany({
    where: { entityType: "Requisition", entityId: req.id },
    orderBy: { createdAt: "asc" },
  });
  let splittingBanner: string | null = null;
  for (const flag of allFlags) {
    const details = (flag.details ?? {}) as Record<string, unknown>;
    if (flag.flagType === "SPLITTING_SUSPECT") {
      splittingBanner =
        typeof details.bannerText === "string"
          ? details.bannerText
          : "SPLITTING SUSPECT — combined value exceeds ADM limit. Routed to DM.";
      rows.push({
        severity: "CRITICAL",
        category: "Splitting",
        message: splittingBanner,
      });
    } else if (flag.flagType === "ESTIMATE_EXCEEDED") {
      if (flag.severity === "CRITICAL") {
        rows.push({
          severity: "CRITICAL",
          category: "Revised sanction",
          message:
            typeof details.bannerText === "string"
              ? details.bannerText
              : "Revised sanction requested — procured amount exceeds tolerance.",
        });
      } else {
        rows.push({
          severity: "WARN",
          category: "Estimate exceeded",
          message: `Procured ₹${inr.format(Number(details.procured ?? 0))} is above sanction ₹${inr.format(Number(details.sanction ?? 0))} (within tolerance).`,
        });
      }
    } else if (flag.flagType === "DUPLICATE_SUSPECT") {
      const overlaps = Array.isArray(details.overlaps)
        ? (details.overlaps as { reqNumber?: string }[])
            .map((o) => o.reqNumber)
            .filter(Boolean)
            .join(", ")
        : "";
      rows.push({
        severity: "INFO",
        category: "Duplicate",
        message: overlaps
          ? `Overlapping open requisitions: ${overlaps}`
          : "Submitted despite overlapping open requisitions",
      });
    }
  }

  if (rows.length === 0) {
    rows.push({
      severity: "OK",
      category: "All clear",
      message: "No deviations detected",
    });
  }

  const unacknowledgedFlags = await prisma.flag.findMany({
    where: {
      entityType: "Requisition",
      entityId: req.id,
      severity: { in: ["WARN", "CRITICAL"] },
      acknowledgedAt: null,
    },
  });

  return { rows, unacknowledgedFlags, splittingBanner };
}

async function ensureFlag(
  requisitionId: string,
  flagType: "PRICE_DEVIATION" | "QTY_ANOMALY" | "FREQUENCY_ANOMALY",
  messages: string[],
): Promise<void> {
  if (messages.length === 0) return;
  const existing = await prisma.flag.findFirst({
    where: { entityType: "Requisition", entityId: requisitionId, flagType },
  });
  if (existing) return;
  await prisma.flag.create({
    data: {
      entityType: "Requisition",
      entityId: requisitionId,
      flagType,
      severity: "WARN",
      details: { messages },
    },
  });
}
