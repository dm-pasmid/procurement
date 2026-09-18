"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { allocateNumber, deriveFy } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { soTotal } from "@/lib/so-utils";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const lineSchema = z.object({
  reqItemId: z.string().nullable().optional(),
  description: z.string().trim().min(1, "Line description is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  qty: z.coerce.number().positive("Quantity must be greater than 0"),
  rate: z.coerce.number().positive("Rate must be greater than 0"),
  gstPercent: z.coerce.number().min(0).max(100),
});

const draftSchema = z.object({
  id: z.string().optional(),
  requisitionId: z.string().min(1),
  deliverySectionId: z.string().min(1, "Delivery section is required"),
  deliveryDays: z.coerce.number().int().positive("Delivery period is required"),
  terms: z.string().trim().min(1, "Terms are required"),
  lines: z.array(lineSchema).min(1, "At least one line is required"),
});

/** Hard tolerance gate — same rule as procurement (Prompt 5). */
async function toleranceProblem(
  requisitionId: string,
  totalInclGst: number,
): Promise<string | null> {
  const req = await prisma.requisition.findUniqueOrThrow({
    where: { id: requisitionId },
  });
  const sanction = Number(req.sanctionedTotal ?? req.estimatedTotal);
  const tolerancePct = await getSettingNumber("EST_TOLERANCE_PCT");
  const ceiling = sanction * (1 + tolerancePct / 100);
  if (totalInclGst > ceiling) {
    const overPct = ((totalInclGst - sanction) / sanction) * 100;
    return `SO total (incl. GST) ₹${inr(totalInclGst)} exceeds sanction ₹${inr(sanction)} by ${overPct.toFixed(1)}% (> ${tolerancePct}%). Reduce the order or obtain revised sanction.`;
  }
  return null;
}

export async function saveSoDraft(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "supplyOrder");
    const data = draftSchema.parse(input);

    const total = soTotal(data.lines);
    const gateProblem = await toleranceProblem(data.requisitionId, total);
    if (gateProblem) return { ok: false, error: gateProblem };

    const lineRows = data.lines.map((l) => ({
      reqItemId: l.reqItemId || null,
      description: l.description,
      unit: l.unit,
      qty: new Prisma.Decimal(l.qty.toFixed(3)),
      rate: new Prisma.Decimal(l.rate.toFixed(2)),
      gstPercent: new Prisma.Decimal(l.gstPercent.toFixed(2)),
    }));

    if (data.id) {
      const existing = await prisma.supplyOrder.findUniqueOrThrow({
        where: { id: data.id },
        include: { items: true },
      });
      // Server-side freeze: an ISSUED (or later) SO is never mutated.
      if (existing.status !== "DRAFT") {
        return { ok: false, error: "Only draft supply orders can be edited." };
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.supplyOrderItem.deleteMany({ where: { soId: existing.id } });
        return tx.supplyOrder.update({
          where: { id: existing.id },
          data: {
            deliverySectionId: data.deliverySectionId,
            deliveryDays: data.deliveryDays,
            terms: data.terms,
            items: { create: lineRows },
          },
        });
      });
      await logAudit(user.id, "SupplyOrder", existing.id, "UPDATE_DRAFT", existing, updated);
      revalidatePath("/supply-orders");
      return { ok: true, data: { id: existing.id } };
    }

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: data.requisitionId },
      include: { procurement: true },
    });
    if (req.status !== "IN_PROCUREMENT" || !req.procurement?.confirmedAt) {
      return { ok: false, error: "Supply orders are drafted after procurement is confirmed." };
    }

    const created = await prisma.supplyOrder.create({
      data: {
        soNumber: `DRAFT-${crypto.randomUUID()}`,
        fy: deriveFy(),
        requisitionId: req.id,
        procurementId: req.procurement.id,
        vendorId: req.procurement.vendorId,
        deliverySectionId: data.deliverySectionId,
        deliveryDays: data.deliveryDays,
        terms: data.terms,
        status: "DRAFT",
        items: { create: lineRows },
      },
    });
    await logAudit(user.id, "SupplyOrder", created.id, "CREATE_DRAFT", null, created);
    revalidatePath("/supply-orders");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** NDC only: allocates the gapless SO number, freezes and issues. */
export async function issueSo(soId: string): Promise<ActionResult<{ soNumber: string }>> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can issue a supply order." };
    }

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: soId },
      include: { items: true, requisition: true, parentSo: true },
    });
    if (so.status !== "DRAFT") {
      return { ok: false, error: "Only a draft can be issued." };
    }
    if (so.items.length === 0) {
      return { ok: false, error: "The supply order has no lines." };
    }

    const total = soTotal(
      so.items.map((l) => ({
        qty: Number(l.qty),
        rate: Number(l.rate),
        gstPercent: Number(l.gstPercent),
      })),
    );
    const gateProblem = await toleranceProblem(so.requisitionId, total);
    if (gateProblem) return { ok: false, error: gateProblem };

    const fy = deriveFy();
    const issued = await prisma.$transaction(async (tx) => {
      const soNumber = await allocateNumber("SO", fy, tx);
      const updated = await tx.supplyOrder.update({
        where: { id: so.id },
        data: {
          soNumber,
          fy,
          status: "ISSUED",
          issuedById: user.id,
          issuedAt: new Date(),
        },
      });
      // Issuing an amendment supersedes its parent.
      if (so.parentSoId) {
        await tx.supplyOrder.update({
          where: { id: so.parentSoId },
          data: { status: "AMENDED" },
        });
      }
      await tx.requisition.update({
        where: { id: so.requisitionId },
        data: { status: "SO_ISSUED" },
      });
      return updated;
    });
    await logAudit(user.id, "SupplyOrder", so.id, "ISSUE", { status: "DRAFT" }, issued);
    if (so.parentSoId) {
      await logAudit(user.id, "SupplyOrder", so.parentSoId, "SUPERSEDED", null, {
        byVersion: so.version,
        bySoId: so.id,
      });
    }
    await logAudit(user.id, "Requisition", so.requisitionId, "SO_ISSUED", null, {
      soNumber: issued.soNumber,
    });

    revalidatePath("/supply-orders");
    revalidatePath("/requisitions");
    return { ok: true, data: { soNumber: issued.soNumber } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Creates version n+1 as a fresh draft copying all fields and lines. */
export async function amendSo(soId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "update", "supplyOrder");

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: soId },
      include: { items: true, amendments: { where: { status: "DRAFT" } } },
    });
    if (so.status !== "ISSUED") {
      return { ok: false, error: "Only an issued supply order can be amended." };
    }
    if (so.amendments.length > 0) {
      return { ok: true, data: { id: so.amendments[0].id } }; // draft already open
    }

    const draft = await prisma.supplyOrder.create({
      data: {
        soNumber: `DRAFT-${crypto.randomUUID()}`,
        fy: so.fy,
        requisitionId: so.requisitionId,
        procurementId: so.procurementId,
        vendorId: so.vendorId,
        deliverySectionId: so.deliverySectionId,
        deliveryDays: so.deliveryDays,
        terms: so.terms,
        status: "DRAFT",
        version: so.version + 1,
        parentSoId: so.id,
        items: {
          create: so.items.map((l) => ({
            reqItemId: l.reqItemId,
            description: l.description,
            unit: l.unit,
            qty: l.qty,
            rate: l.rate,
            gstPercent: l.gstPercent,
          })),
        },
      },
    });
    await logAudit(user.id, "SupplyOrder", so.id, "AMENDMENT_DRAFTED", null, {
      draftId: draft.id,
      version: draft.version,
    });

    revalidatePath("/supply-orders");
    return { ok: true, data: { id: draft.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const cancelSchema = z.object({
  soId: z.string().min(1),
  reason: z.string().trim().min(10, "A cancellation reason is required"),
});

/** Cancel with reason. The allocated number is never reused. */
export async function cancelSo(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can cancel a supply order." };
    }
    const data = cancelSchema.parse(input);

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: data.soId },
      include: { grns: true },
    });
    if (so.status !== "DRAFT" && so.status !== "ISSUED") {
      return { ok: false, error: "This supply order can no longer be cancelled." };
    }
    if (so.grns.length > 0) {
      return { ok: false, error: "Goods have been received against this SO — it cannot be cancelled." };
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.supplyOrder.update({
        where: { id: so.id },
        // Reason recorded on the SO (shortCloseReason doubles as the
        // closure/cancellation reason field) and in the audit trail.
        data: { status: "CANCELLED", shortCloseReason: data.reason },
      });
      // If this was the only active SO, the case returns to procurement.
      const stillActive = await tx.supplyOrder.count({
        where: {
          requisitionId: so.requisitionId,
          status: { in: ["ISSUED", "DRAFT"] },
        },
      });
      if (stillActive === 0) {
        await tx.requisition.update({
          where: { id: so.requisitionId },
          data: { status: "IN_PROCUREMENT" },
        });
      }
      return updated;
    });
    await logAudit(user.id, "SupplyOrder", so.id, "CANCEL", { status: so.status }, {
      status: "CANCELLED",
      reason: data.reason,
    });

    revalidatePath("/supply-orders");
    revalidatePath("/requisitions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const shortCloseSchema = z.object({
  soId: z.string().min(1),
  reason: z.string().trim().min(10, "A short-close reason is required"),
});

/**
 * NDC short-closes an SO with undelivered balance: SO → SHORT_CLOSED,
 * requisition → RECEIVED (whatever arrived is all that will).
 */
export async function shortCloseSo(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can short-close a supply order." };
    }
    const data = shortCloseSchema.parse(input);

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: data.soId },
      include: {
        items: true,
        grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
      },
    });
    if (so.status !== "ISSUED") {
      return { ok: false, error: "Only an issued supply order can be short-closed." };
    }
    const receivedFor = (soItemId: string) =>
      so.grns.reduce(
        (sum, grn) =>
          sum +
          grn.items
            .filter((g) => g.soItemId === soItemId)
            .reduce((s, g) => s + Number(g.qtyReceived), 0),
        0,
      );
    const hasBalance = so.items.some(
      (line) => receivedFor(line.id) < Number(line.qty) - 1e-9,
    );
    if (!hasBalance) {
      return { ok: false, error: "Nothing is undelivered — the SO closes automatically when fully received." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplyOrder.update({
        where: { id: so.id },
        data: { status: "SHORT_CLOSED", shortCloseReason: data.reason },
      });
      await tx.requisition.update({
        where: { id: so.requisitionId },
        data: { status: "RECEIVED" },
      });
    });
    await logAudit(user.id, "SupplyOrder", so.id, "SHORT_CLOSE", { status: "ISSUED" }, {
      status: "SHORT_CLOSED",
      reason: data.reason,
    });

    revalidatePath("/supply-orders");
    revalidatePath("/requisitions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * NDC closes the case once the SO is fully received (CLOSED) or SHORT_CLOSED
 * and every bill against it is PAID. Requisition → CLOSED (read-only,
 * fully visible in registers and search).
 */
export async function closeCase(soId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can close a case." };
    }

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: soId },
      include: { bills: true, requisition: true },
    });
    if (so.status !== "CLOSED" && so.status !== "SHORT_CLOSED") {
      return { ok: false, error: "The SO must be fully received or short-closed first." };
    }
    const unpaid = so.bills.filter((b) => b.status !== "PAID");
    if (unpaid.length > 0) {
      return {
        ok: false,
        error: `${unpaid.length} bill${unpaid.length === 1 ? " is" : "s are"} not yet fully paid.`,
      };
    }
    if (so.requisition.status === "CLOSED") {
      return { ok: false, error: "This case is already closed." };
    }

    await prisma.requisition.update({
      where: { id: so.requisitionId },
      data: { status: "CLOSED" },
    });
    await logAudit(user.id, "Requisition", so.requisitionId, "CASE_CLOSED", {
      status: so.requisition.status,
    }, { status: "CLOSED" });

    revalidatePath("/supply-orders");
    revalidatePath("/requisitions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => i.message).join("; ");
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
