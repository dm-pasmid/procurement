"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/authz";
import { GRN_DECLARATION } from "@/lib/grn-constants";
import { allocateNumber, deriveFy } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";
import { signedAttachmentUrl, uploadAttachmentFile } from "@/lib/storage";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// SO lookup for GRN entry
// ---------------------------------------------------------------------------

export interface GrnSoLine {
  soItemId: string;
  description: string;
  unit: string;
  ordered: number;
  /** Received across all other GRNs of this SO (draft + countersigned). */
  receivedSoFar: number;
}

export interface GrnSoData {
  soId: string;
  soNumber: string;
  vendorName: string;
  deliverySectionName: string;
  lines: GrnSoLine[];
}

async function loadSoLines(
  soId: string,
  excludeGrnId?: string,
): Promise<GrnSoLine[]> {
  const so = await prisma.supplyOrder.findUniqueOrThrow({
    where: { id: soId },
    include: {
      items: true,
      grns: {
        where: excludeGrnId ? { id: { not: excludeGrnId } } : undefined,
        include: { items: true },
      },
    },
  });
  return so.items.map((line) => ({
    soItemId: line.id,
    description: line.description,
    unit: line.unit,
    ordered: Number(line.qty),
    receivedSoFar: so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === line.id)
          .reduce((s, g) => s + Number(g.qtyReceived), 0),
      0,
    ),
  }));
}

/** Fetches an ISSUED SO by its number for receiving (delivery section only). */
export async function lookupSoForGrn(
  soNumber: string,
): Promise<ActionResult<GrnSoData>> {
  try {
    const user = await requireUser();
    const so = await prisma.supplyOrder.findFirst({
      where: { soNumber: soNumber.trim() },
      include: { vendor: true, deliverySection: true },
    });
    if (!so) return { ok: false, error: `No supply order found for “${soNumber.trim()}”.` };
    if (so.status !== "ISSUED") {
      return { ok: false, error: `${so.soNumber} is ${so.status} — goods are received only against an issued SO.` };
    }
    if (!can(user, "create", "grn", { sectionId: so.deliverySectionId })) {
      return {
        ok: false,
        error: `This SO delivers to ${so.deliverySection.name} — only that section receives against it.`,
      };
    }
    const lines = await loadSoLines(so.id);
    return {
      ok: true,
      data: {
        soId: so.id,
        soNumber: so.soNumber,
        vendorName: so.vendor.name,
        deliverySectionName: so.deliverySection.name,
        lines,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Draft save (receiver) with hard validations
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  soItemId: z.string().min(1),
  qtyReceived: z.coerce.number().min(0),
  qtyAccepted: z.coerce.number().min(0),
  qtyRejected: z.coerce.number().min(0),
  remarks: z.string().trim().optional(),
});

const draftSchema = z.object({
  id: z.string().optional(),
  soId: z.string().min(1),
  receiptDate: z.string().min(1, "Receipt date is required"),
  challanNumber: z.string().trim().min(1, "Challan number is required"),
  challanDate: z.string().min(1, "Challan date is required"),
  remarks: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function saveGrnDraft(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = draftSchema.parse(input);

    const so = await prisma.supplyOrder.findUniqueOrThrow({
      where: { id: data.soId },
      include: { items: true },
    });
    assertCan(user, data.id ? "update" : "create", "grn", {
      sectionId: so.deliverySectionId,
    });
    if (so.status !== "ISSUED") {
      return { ok: false, error: "Goods are received only against an issued SO." };
    }
    if (data.id) {
      const existing = await prisma.grn.findUniqueOrThrow({ where: { id: data.id } });
      if (existing.status !== "DRAFT") {
        return { ok: false, error: "A countersigned GRN cannot be edited — the OC must reopen it first." };
      }
    }

    // ---- hard validations ----
    const soLineById = new Map(so.items.map((l) => [l.id, l]));
    const problems: string[] = [];
    const meaningful = data.lines.filter((l) => l.qtyReceived > 0);
    if (meaningful.length === 0) {
      problems.push("Enter a received quantity on at least one line.");
    }
    const priorLines = await loadSoLines(so.id, data.id);
    const priorById = new Map(priorLines.map((l) => [l.soItemId, l]));
    for (const line of data.lines) {
      const soLine = soLineById.get(line.soItemId);
      if (!soLine) return { ok: false, error: "Line does not belong to this SO." };
      const label = soLine.description;
      if (Math.abs(line.qtyAccepted + line.qtyRejected - line.qtyReceived) > 1e-9) {
        problems.push(`${label}: accepted + rejected must equal received.`);
      }
      if (line.qtyRejected > 0 && !line.remarks) {
        problems.push(`${label}: remarks are mandatory when quantity is rejected.`);
      }
      const cumulative = (priorById.get(line.soItemId)?.receivedSoFar ?? 0) + line.qtyReceived;
      if (cumulative > Number(soLine.qty) + 1e-9) {
        problems.push(
          `${label}: cumulative received (${cumulative}) would exceed ordered quantity (${Number(soLine.qty)}).`,
        );
      }
    }
    if (problems.length > 0) return { ok: false, error: problems.join(" ") };

    const values = {
      receiptDate: new Date(data.receiptDate),
      challanNumber: data.challanNumber,
      challanDate: new Date(data.challanDate),
      remarks: data.remarks || null,
    };
    const lineRows = meaningful.map((l) => ({
      soItemId: l.soItemId,
      qtyReceived: new Prisma.Decimal(l.qtyReceived.toFixed(3)),
      qtyAccepted: new Prisma.Decimal(l.qtyAccepted.toFixed(3)),
      qtyRejected: new Prisma.Decimal(l.qtyRejected.toFixed(3)),
      remarks: l.remarks || null,
    }));

    if (data.id) {
      const before = await prisma.grn.findUniqueOrThrow({
        where: { id: data.id },
        include: { items: true },
      });
      const updated = await prisma.$transaction(async (tx) => {
        await tx.grnItem.deleteMany({ where: { grnId: data.id } });
        return tx.grn.update({
          where: { id: data.id },
          data: { ...values, items: { create: lineRows } },
        });
      });
      await logAudit(user.id, "Grn", data.id, "UPDATE_DRAFT", before, updated);
      revalidatePath("/grn");
      return { ok: true, data: { id: data.id } };
    }

    const created = await prisma.grn.create({
      data: {
        grnNumber: `DRAFT-${crypto.randomUUID()}`,
        soId: so.id,
        receiverId: user.id,
        status: "DRAFT",
        ...values,
        items: { create: lineRows },
      },
    });
    await logAudit(user.id, "Grn", created.id, "CREATE_DRAFT", null, created);
    revalidatePath("/grn");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// OC countersignature
// ---------------------------------------------------------------------------

const countersignSchema = z.object({
  grnId: z.string().min(1),
  declarationAccepted: z.literal(true, {
    error: "The declaration must be confirmed to countersign.",
  }),
});

export async function countersignGrn(
  input: unknown,
): Promise<ActionResult<{ grnNumber: string }>> {
  try {
    const user = await requireUser();
    const data = countersignSchema.parse(input);

    const grn = await prisma.grn.findUniqueOrThrow({
      where: { id: data.grnId },
      include: { so: true, items: true },
    });
    if (!can(user, "countersign", "grn", { sectionId: grn.so.deliverySectionId })) {
      return { ok: false, error: "Only the OC of the receiving section can countersign." };
    }
    if (grn.status !== "DRAFT") {
      return { ok: false, error: "This GRN is already countersigned." };
    }

    const fy = deriveFy();
    const signed = await prisma.$transaction(async (tx) => {
      const grnNumber = grn.grnNumber.startsWith("DRAFT-")
        ? await allocateNumber("GRN", fy, tx) // reopened GRNs keep their number
        : grn.grnNumber;
      const updated = await tx.grn.update({
        where: { id: grn.id },
        data: {
          grnNumber,
          status: "COUNTERSIGNED",
          ocCountersignedById: user.id,
          ocCountersignedAt: new Date(),
        },
      });
      await rollUpStatuses(tx, grn.soId);
      return updated;
    });
    await logAudit(user.id, "Grn", grn.id, "COUNTERSIGN", { status: "DRAFT" }, {
      status: "COUNTERSIGNED",
      grnNumber: signed.grnNumber,
      declaration: GRN_DECLARATION,
    });

    await updatePriceIntelligence(grn.soId);

    revalidatePath("/grn");
    revalidatePath("/supply-orders");
    revalidatePath("/requisitions");
    return { ok: true, data: { grnNumber: signed.grnNumber } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Reopen (OC, mandatory reason — never a negative reversal GRN)
// ---------------------------------------------------------------------------

const reopenSchema = z.object({
  grnId: z.string().min(1),
  reason: z.string().trim().min(10, "A reopen reason (min 10 characters) is mandatory"),
});

export async function reopenGrn(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = reopenSchema.parse(input);

    const grn = await prisma.grn.findUniqueOrThrow({
      where: { id: data.grnId },
      include: { so: true },
    });
    if (!can(user, "countersign", "grn", { sectionId: grn.so.deliverySectionId })) {
      return { ok: false, error: "Only the OC of the receiving section can reopen a GRN." };
    }
    if (grn.status !== "COUNTERSIGNED") {
      return { ok: false, error: "Only a countersigned GRN can be reopened." };
    }
    const billCount = await prisma.bill.count({ where: { soId: grn.soId } });
    if (billCount > 0) {
      return { ok: false, error: "A bill exists against this SO — the GRN can no longer be reopened." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.grn.update({
        where: { id: grn.id },
        data: { status: "DRAFT", ocCountersignedById: null, ocCountersignedAt: null },
      });
      await rollUpStatuses(tx, grn.soId);
    });
    // The reopen reason lives in the append-only audit trail and is shown on
    // the GRN for ever.
    await logAudit(user.id, "Grn", grn.id, "REOPEN", { status: "COUNTERSIGNED" }, {
      status: "DRAFT",
      reason: data.reason,
    });

    revalidatePath("/grn");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Status roll-up + price intelligence
// ---------------------------------------------------------------------------

/**
 * Recomputes SO and requisition statuses from countersigned receipts:
 * every line fully received → SO CLOSED + requisition RECEIVED; anything
 * received → PARTIALLY_RECEIVED; nothing (e.g. after reopen) → SO_ISSUED.
 */
async function rollUpStatuses(tx: Prisma.TransactionClient, soId: string) {
  const so = await tx.supplyOrder.findUniqueOrThrow({
    where: { id: soId },
    include: {
      items: true,
      grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
    },
  });
  if (!["ISSUED", "CLOSED"].includes(so.status)) return;

  const receivedFor = (soItemId: string) =>
    so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === soItemId)
          .reduce((s, g) => s + Number(g.qtyReceived), 0),
      0,
    );
  const fully = so.items.every(
    (line) => receivedFor(line.id) >= Number(line.qty) - 1e-9,
  );
  const any = so.items.some((line) => receivedFor(line.id) > 0);

  await tx.supplyOrder.update({
    where: { id: soId },
    data: { status: fully ? "CLOSED" : "ISSUED" },
  });
  await tx.requisition.update({
    where: { id: so.requisitionId },
    data: {
      status: fully ? "RECEIVED" : any ? "PARTIALLY_RECEIVED" : "SO_ISSUED",
    },
  });
}

/**
 * Once a master-item line is fully received (with some acceptance) across
 * countersigned GRNs, stamp Item.lastPurchaseRate/Date from the SO line and
 * recompute the 12-month average SO rate — feeds the Smart Checks price
 * intelligence.
 */
async function updatePriceIntelligence(soId: string) {
  const so = await prisma.supplyOrder.findUniqueOrThrow({
    where: { id: soId },
    include: {
      items: { include: { reqItem: true } },
      grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
    },
  });

  for (const line of so.items) {
    const itemId = line.reqItem?.itemId;
    if (!itemId) continue;

    let received = 0;
    let accepted = 0;
    let lastReceipt: Date | null = null;
    for (const grn of so.grns) {
      for (const g of grn.items) {
        if (g.soItemId !== line.id) continue;
        received += Number(g.qtyReceived);
        accepted += Number(g.qtyAccepted);
        if (!lastReceipt || grn.receiptDate > lastReceipt) {
          lastReceipt = grn.receiptDate;
        }
      }
    }
    const complete = received >= Number(line.qty) - 1e-9 && accepted > 0;
    if (!complete || !lastReceipt) continue;

    // 12-month average of SO rates for this item (issued orders).
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const rates = await prisma.supplyOrderItem.findMany({
      where: {
        reqItem: { itemId },
        so: { issuedAt: { gte: yearAgo }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      },
      select: { rate: true },
    });
    const avg =
      rates.length > 0
        ? rates.reduce((s, r) => s + Number(r.rate), 0) / rates.length
        : Number(line.rate);

    const before = await prisma.item.findUnique({ where: { id: itemId } });
    const after = await prisma.item.update({
      where: { id: itemId },
      data: {
        lastPurchaseRate: line.rate,
        lastPurchaseDate: lastReceipt,
        avgRate12m: new Prisma.Decimal(avg.toFixed(2)),
      },
    });
    await logAudit(null, "Item", itemId, "PRICE_INTEL_UPDATE", before, after);
  }
}

// ---------------------------------------------------------------------------
// Challan attachment
// ---------------------------------------------------------------------------

export async function uploadGrnAttachment(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const grnId = String(formData.get("grnId") ?? "");
    const label = String(formData.get("label") ?? "").trim() || "Challan copy";
    const file = formData.get("file");
    if (!grnId || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a file to upload." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "File too large (max 10 MB)." };
    }
    const grn = await prisma.grn.findUniqueOrThrow({
      where: { id: grnId },
      include: { so: true },
    });
    assertCan(user, "update", "grn", { sectionId: grn.so.deliverySectionId });

    const path = await uploadAttachmentFile("Grn", grnId, file);
    const attachment = await prisma.attachment.create({
      data: {
        entityType: "Grn",
        entityId: grnId,
        label,
        fileUrl: path,
        uploadedById: user.id,
      },
    });
    await logAudit(user.id, "Attachment", attachment.id, "CREATE", null, attachment);
    revalidatePath(`/grn/${grnId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getGrnAttachmentUrl(
  attachmentId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    await requireUser();
    const attachment = await prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    const url = await signedAttachmentUrl(attachment.fileUrl);
    return { ok: true, data: { url } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => i.message).join("; ");
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
