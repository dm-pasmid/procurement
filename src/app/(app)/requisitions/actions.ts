"use server";

import { revalidatePath } from "next/cache";
import { EstBasis, Prisma, ReqStatus } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { allocateNumber, deriveFy } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";
import { detectAndApplySplitting } from "@/lib/splitting";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Statuses a requisition can still be edited/submitted in. */
const EDITABLE: ReqStatus[] = ["DRAFT", "RETURNED"];
/** Statuses that no longer count for duplicate detection. */
const DUPLICATE_EXCLUDED: ReqStatus[] = ["CLOSED", "REJECTED", "DRAFT"];

const lineSchema = z.object({
  itemId: z.string().nullable().optional(),
  itemNameFree: z.string().trim().nullable().optional(),
  specification: z.string().trim().optional(),
  unit: z.string().trim().min(1, "Unit is required on every line"),
  qty: z.coerce.number().min(0, "Quantity cannot be negative"),
  estRate: z.coerce.number().min(0, "Rate cannot be negative"),
  estBasis: z.enum(EstBasis).nullable().optional(),
  basisRemarks: z.string().trim().optional(),
});

const draftSchema = z.object({
  id: z.string().optional(),
  purpose: z
    .string()
    .trim()
    .min(20, "Purpose / justification must be at least 20 characters"),
  desiredDeliveryDays: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  lines: z
    .array(lineSchema)
    .min(1, "At least one line item is required")
    .refine(
      (lines) => lines.every((l) => l.itemId || l.itemNameFree),
      "Every line must have an item (from master or free text)",
    ),
});

async function admLimit(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "ADM_LIMIT" },
  });
  return setting ? Number(setting.value) : 20000;
}

function computeTotal(lines: z.infer<typeof lineSchema>[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.estRate, 0);
}

/**
 * Creates or updates a DRAFT (or RETURNED) requisition for the user's own
 * section. Line validation is light here — the hard gate runs at submit.
 */
export async function saveDraft(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = draftSchema.parse(input);
    const limit = await admLimit();
    const total = computeTotal(data.lines);

    const values = {
      purpose: data.purpose,
      desiredDeliveryDays: data.desiredDeliveryDays ?? null,
      estimatedTotal: new Prisma.Decimal(total.toFixed(2)),
      finalLevel: total <= limit ? ("ADM" as const) : ("DM" as const),
    };
    const lineRows = data.lines.map((l) => ({
      itemId: l.itemId || null,
      itemNameFree: l.itemId ? null : l.itemNameFree || null,
      specification: l.specification || null,
      unit: l.unit,
      qty: new Prisma.Decimal(l.qty.toFixed(3)),
      estRate: new Prisma.Decimal(l.estRate.toFixed(2)),
      estBasis: l.estBasis ?? "OTHER",
      basisRemarks: l.basisRemarks || null,
    }));

    if (data.id) {
      const existing = await prisma.requisition.findUniqueOrThrow({
        where: { id: data.id },
        include: { items: true },
      });
      assertCan(user, "update", "requisition", {
        sectionId: existing.sectionId,
      });
      if (!EDITABLE.includes(existing.status)) {
        return { ok: false, error: "Only drafts or returned requisitions can be edited." };
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.requisitionItem.deleteMany({
          where: { requisitionId: existing.id },
        });
        return tx.requisition.update({
          where: { id: existing.id },
          data: { ...values, items: { create: lineRows } },
          include: { items: true },
        });
      });
      await logAudit(user.id, "Requisition", existing.id, "UPDATE_DRAFT", existing, updated);
      revalidatePath("/requisitions");
      return { ok: true, data: { id: existing.id } };
    }

    assertCan(user, "create", "requisition", { sectionId: user.sectionId });
    const created = await prisma.requisition.create({
      data: {
        // Placeholder until submission allocates a gapless number.
        reqNumber: `DRAFT-${crypto.randomUUID()}`,
        fy: deriveFy(),
        sectionId: user.sectionId,
        initiatorId: user.id,
        status: "DRAFT",
        ...values,
        items: { create: lineRows },
      },
      include: { items: true },
    });
    await logAudit(user.id, "Requisition", created.id, "CREATE_DRAFT", null, created);
    revalidatePath("/requisitions");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Hard gate + submission. Every line must have qty > 0, estRate > 0 and a
 * basis (remarks mandatory for OTHER); purpose must be present. Allocates the
 * requisition number and computes the final approval level from ADM_LIMIT.
 */
export async function submitRequisition(
  input: unknown,
): Promise<ActionResult<{ id: string; reqNumber: string }>> {
  try {
    const user = await requireUser();
    // Persist the latest form state first, then submit what was saved.
    const saved = await saveDraft(input);
    if (!saved.ok) return saved;
    const id = saved.data!.id;

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { item: true } } },
    });
    assertCan(user, "update", "requisition", { sectionId: req.sectionId });
    if (!EDITABLE.includes(req.status)) {
      return { ok: false, error: "This requisition has already been submitted." };
    }

    // ---- Hard gate: no submission without a complete item-wise estimate ----
    const problems: string[] = [];
    if (req.purpose.trim().length < 20) {
      problems.push("Purpose / justification is required (min 20 characters).");
    }
    if (req.items.length === 0) problems.push("At least one line item is required.");
    req.items.forEach((line, i) => {
      const label = line.item?.name ?? line.itemNameFree ?? `Line ${i + 1}`;
      if (line.qty.lte(0)) problems.push(`${label}: quantity must be greater than 0.`);
      if (line.estRate.lte(0)) problems.push(`${label}: estimated rate must be greater than 0.`);
      if (line.estBasis === "OTHER" && !line.basisRemarks) {
        problems.push(`${label}: remarks are mandatory when basis is OTHER.`);
      }
    });
    if (problems.length > 0) {
      return { ok: false, error: problems.join(" ") };
    }

    const limit = await admLimit();
    const total = req.items.reduce(
      (sum, l) => sum + Number(l.qty) * Number(l.estRate),
      0,
    );
    const fy = deriveFy();

    const submitted = await prisma.$transaction(async (tx) => {
      const reqNumber = req.reqNumber.startsWith("DRAFT-")
        ? await allocateNumber("REQ", fy, tx)
        : req.reqNumber; // resubmission after RETURN keeps its number
      return tx.requisition.update({
        where: { id },
        data: {
          reqNumber,
          fy,
          status: "SUBMITTED",
          estimatedTotal: new Prisma.Decimal(total.toFixed(2)),
          finalLevel: total <= limit ? "ADM" : "DM",
        },
      });
    });
    await logAudit(user.id, "Requisition", id, "SUBMIT", req, submitted);

    // Statutory-integrity control: flags CRITICAL and forces DM routing when
    // same-section requisitions in the window combine past ADM_LIMIT.
    const splitting = await detectAndApplySplitting(id);
    if (splitting) {
      await logAudit(null, "Requisition", id, "SPLITTING_DETECTED", null, {
        reason: splitting.reason,
        combined: splitting.combined,
        matched: splitting.matched,
      });
    }

    // Duplicate suspicion is suggestive only — flag, never block.
    const duplicates = await findDuplicateReqs(
      req.sectionId,
      req.items.flatMap((l) => (l.itemId ? [l.itemId] : [])),
      id,
    );
    if (duplicates.length > 0) {
      await prisma.flag.create({
        data: {
          entityType: "Requisition",
          entityId: id,
          flagType: "DUPLICATE_SUSPECT",
          severity: "INFO",
          details: {
            note: "Submitted despite overlapping open requisitions in the same section",
            overlaps: duplicates.map((d) => ({
              requisitionId: d.id,
              reqNumber: d.reqNumber,
              status: d.status,
              items: d.items,
            })),
          },
        },
      });
    }

    revalidatePath("/requisitions");
    return {
      ok: true,
      data: { id, reqNumber: submitted.reqNumber },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Suggestive duplicate lookup: other non-closed, non-draft requisitions of
 * the same section sharing any master item.
 */
export async function findDuplicates(
  itemIds: string[],
  excludeId?: string,
): Promise<
  ActionResult<{ id: string; reqNumber: string; status: ReqStatus; items: string[] }[]>
> {
  try {
    const user = await requireUser();
    if (itemIds.length === 0) return { ok: true, data: [] };
    const duplicates = await findDuplicateReqs(user.sectionId, itemIds, excludeId);
    return { ok: true, data: duplicates };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

async function findDuplicateReqs(
  sectionId: string,
  itemIds: string[],
  excludeId?: string,
) {
  if (itemIds.length === 0) return [];
  const reqs = await prisma.requisition.findMany({
    where: {
      sectionId,
      id: { not: excludeId },
      status: { notIn: DUPLICATE_EXCLUDED },
      items: { some: { itemId: { in: itemIds } } },
    },
    include: {
      items: {
        where: { itemId: { in: itemIds } },
        include: { item: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return reqs.map((r) => ({
    id: r.id,
    reqNumber: r.reqNumber,
    status: r.status,
    items: r.items.map((l) => l.item?.name ?? "").filter(Boolean),
  }));
}

function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => i.message).join("; ");
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
