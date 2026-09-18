import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettingNumbers } from "@/lib/settings";

/**
 * Artificial-splitting detection — a statutory-integrity control.
 *
 * On every submission, look back SPLIT_WINDOW_DAYS at requisitions of the
 * same section (drafts and rejected excluded) sharing any item family with
 * the new one. If the combined estimate exceeds ADM_LIMIT while every
 * individual requisition stays at or under it, the pattern suggests one
 * purchase split to dodge the DM's sanction level: flag CRITICAL and force
 * finalLevel = DM. Visibility and routing — never blocking.
 */

export interface SplitMatch {
  requisitionId: string;
  reqNumber: string;
  amount: number;
}

export interface SplitDetection {
  matched: SplitMatch[];
  combined: number;
  windowDays: number;
  bannerText: string;
  reason: string;
}

/** lowercase, trim, collapse spaces */
export function normaliseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Same item family: equal after normalisation, or one contains the other. */
export function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

const inr = new Intl.NumberFormat("en-IN");

/**
 * Runs after a requisition is submitted. Returns the detection (or null),
 * having already flagged and re-routed the requisition when triggered.
 */
export async function detectAndApplySplitting(
  requisitionId: string,
): Promise<SplitDetection | null> {
  const settings = await getSettingNumbers(["SPLIT_WINDOW_DAYS", "ADM_LIMIT"]);
  const windowDays = settings.SPLIT_WINDOW_DAYS;
  const admLimit = settings.ADM_LIMIT;

  const req = await prisma.requisition.findUniqueOrThrow({
    where: { id: requisitionId },
    include: { items: { include: { item: true } } },
  });

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.requisition.findMany({
    where: {
      sectionId: req.sectionId,
      id: { not: req.id },
      status: { notIn: ["REJECTED", "DRAFT"] },
      createdAt: { gte: since },
    },
    include: { items: { include: { item: true } } },
  });

  const newLines = req.items.map((l) => ({
    itemId: l.itemId,
    name: l.item?.name ?? l.itemNameFree ?? "",
  }));

  const matched: SplitMatch[] = [];
  for (const candidate of candidates) {
    const shares = candidate.items.some((cl) => {
      const cName = cl.item?.name ?? cl.itemNameFree ?? "";
      return newLines.some(
        (nl) =>
          (nl.itemId && cl.itemId && nl.itemId === cl.itemId) ||
          namesMatch(nl.name, cName),
      );
    });
    if (shares) {
      matched.push({
        requisitionId: candidate.id,
        reqNumber: candidate.reqNumber,
        amount: Number(candidate.estimatedTotal),
      });
    }
  }
  if (matched.length === 0) return null;

  const own = Number(req.estimatedTotal);
  const combined = matched.reduce((sum, m) => sum + m.amount, own);
  const allIndividuallyUnderLimit =
    own <= admLimit && matched.every((m) => m.amount <= admLimit);
  if (!(combined > admLimit && allIndividuallyUnderLimit)) return null;

  const matchedText = matched
    .map((m) => `${m.reqNumber} (₹${inr.format(m.amount)})`)
    .join(" and ");
  const bannerText = `SPLITTING SUSPECT — combined with ${matchedText} exceeds ADM limit. Routed to DM.`;
  const reason = `Suspected splitting: combined value ₹${inr.format(combined)} across ${matched.length + 1} requisitions in ${windowDays} days`;

  await prisma.requisition.update({
    where: { id: req.id },
    data: { finalLevel: "DM", routedToDmReason: reason },
  });

  // One live SPLITTING_SUSPECT flag per requisition; refresh details on resubmission.
  const existing = await prisma.flag.findFirst({
    where: {
      entityType: "Requisition",
      entityId: req.id,
      flagType: "SPLITTING_SUSPECT",
      acknowledgedAt: null,
    },
  });
  const details = {
    windowDays,
    admLimit,
    combined,
    matched: matched.map((m) => ({
      requisitionId: m.requisitionId,
      reqNumber: m.reqNumber,
      amount: m.amount,
    })),
    bannerText,
  };
  if (existing) {
    await prisma.flag.update({ where: { id: existing.id }, data: { details } });
  } else {
    await prisma.flag.create({
      data: {
        entityType: "Requisition",
        entityId: req.id,
        flagType: "SPLITTING_SUSPECT",
        severity: "CRITICAL",
        details,
      },
    });
  }

  return { matched, combined, windowDays, bannerText, reason };
}
