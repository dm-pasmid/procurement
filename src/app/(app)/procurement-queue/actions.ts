"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ProcMode } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import { signedAttachmentUrl, uploadAttachmentFile } from "@/lib/storage";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const procurementSchema = z
  .object({
    requisitionId: z.string().min(1),
    mode: z.enum(ProcMode),
    nitNumber: z.string().trim().optional(),
    nitDate: z.string().trim().optional(), // yyyy-mm-dd
    bidsReceived: z.coerce.number().int().nonnegative().nullable().optional(),
    gemOrderRef: z.string().trim().optional(),
    vendorId: z.string().min(1, "Vendor is required"),
    procuredAmount: z.coerce.number().positive("Procured amount is required"),
    remarks: z.string().trim().optional(),
    /** Required tick when choosing an empanelled vendor whose validity expired. */
    expiredEmpanelmentAck: z.boolean().optional(),
  })
  .refine((v) => v.mode !== "TENDER" || !!v.nitNumber, {
    message: "NIT number is required for TENDER",
  })
  .refine((v) => v.mode !== "TENDER" || !!v.nitDate, {
    message: "NIT date is required for TENDER",
  })
  .refine((v) => v.mode !== "GEM" || !!v.gemOrderRef, {
    message: "GeM order reference is required for GEM",
  });

async function assertVendorSelectable(
  vendorId: string,
  mode: ProcMode,
  expiredAck: boolean | undefined,
): Promise<string | null> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || !vendor.active) return "Vendor not found or inactive.";
  if (mode === "EMPANELLED") {
    if (!vendor.empanelled) return "Selected vendor is not empanelled.";
    const expired =
      vendor.empanelmentValidTill !== null &&
      vendor.empanelmentValidTill.getTime() < Date.now();
    if (expired && !expiredAck) {
      return "Vendor's empanelment has expired — tick the acknowledgement to proceed.";
    }
  }
  return null;
}

/** Create or update the outcome record as a draft (NDC or Nezarath clerk). */
export async function saveProcurementDraft(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "procurement");
    const data = procurementSchema.parse(input);

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: data.requisitionId },
      include: { procurement: true },
    });
    if (req.status !== "APPROVED") {
      return { ok: false, error: "Only APPROVED requisitions can record procurement." };
    }
    if (req.procurement?.confirmedAt) {
      return { ok: false, error: "Procurement is already confirmed for this requisition." };
    }
    const vendorProblem = await assertVendorSelectable(
      data.vendorId,
      data.mode,
      data.expiredEmpanelmentAck,
    );
    if (vendorProblem) return { ok: false, error: vendorProblem };

    const values = {
      mode: data.mode,
      nitNumber: data.mode === "TENDER" ? data.nitNumber || null : null,
      nitDate:
        data.mode === "TENDER" && data.nitDate ? new Date(data.nitDate) : null,
      bidsReceived: data.mode === "TENDER" ? (data.bidsReceived ?? null) : null,
      gemOrderRef: data.mode === "GEM" ? data.gemOrderRef || null : null,
      vendorId: data.vendorId,
      procuredAmount: new Prisma.Decimal(data.procuredAmount.toFixed(2)),
      remarks: data.remarks || null,
    };

    let id: string;
    if (req.procurement) {
      const after = await prisma.procurement.update({
        where: { id: req.procurement.id },
        data: values,
      });
      await logAudit(user.id, "Procurement", after.id, "UPDATE_DRAFT", req.procurement, after);
      id = after.id;
    } else {
      const created = await prisma.procurement.create({
        data: { requisitionId: req.id, createdById: user.id, ...values },
      });
      await logAudit(user.id, "Procurement", created.id, "CREATE_DRAFT", null, created);
      id = created.id;
    }

    revalidatePath("/procurement-queue");
    revalidatePath(`/procurement-queue/${req.id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * NDC confirmation. Hard tolerance gate: procured amount beyond
 * sanction × (1 + EST_TOLERANCE_PCT/100) blocks progression — the case must
 * go for revised sanction. Within tolerance but above sanction raises a
 * suggestive ESTIMATE_EXCEEDED WARN flag.
 */
export async function confirmProcurement(
  input: unknown,
): Promise<ActionResult<{ blocked?: boolean; message?: string }>> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can confirm a procurement outcome." };
    }

    const saved = await saveProcurementDraft(input);
    if (!saved.ok) return saved;

    const data = procurementSchema.parse(input);
    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: data.requisitionId },
      include: { procurement: true },
    });
    const sanction = Number(req.sanctionedTotal ?? req.estimatedTotal);
    const procured = Number(req.procurement!.procuredAmount);
    const tolerancePct = await getSettingNumber("EST_TOLERANCE_PCT");
    const ceiling = sanction * (1 + tolerancePct / 100);

    if (procured > ceiling) {
      const overPct = ((procured - sanction) / sanction) * 100;
      return {
        ok: true,
        data: {
          blocked: true,
          message: `Procured amount ₹${inr(procured)} exceeds sanction ₹${inr(sanction)} by ${overPct.toFixed(1)}% (> ${tolerancePct}%). Send for revised approval.`,
        },
      };
    }

    if (procured > sanction) {
      const existing = await prisma.flag.findFirst({
        where: {
          entityType: "Requisition",
          entityId: req.id,
          flagType: "ESTIMATE_EXCEEDED",
          severity: "WARN",
        },
      });
      if (!existing) {
        await prisma.flag.create({
          data: {
            entityType: "Requisition",
            entityId: req.id,
            flagType: "ESTIMATE_EXCEEDED",
            severity: "WARN",
            details: {
              sanction,
              procured,
              overPct: Math.round(((procured - sanction) / sanction) * 1000) / 10,
              note: "Procured above sanction but within tolerance",
            },
          },
        });
      }
    }

    const confirmed = await prisma.$transaction(async (tx) => {
      const proc = await tx.procurement.update({
        where: { requisitionId: req.id },
        data: { confirmedById: user.id, confirmedAt: new Date() },
      });
      await tx.requisition.update({
        where: { id: req.id },
        data: { status: "IN_PROCUREMENT" },
      });
      return proc;
    });
    await logAudit(user.id, "Procurement", confirmed.id, "CONFIRM", null, confirmed);
    await logAudit(user.id, "Requisition", req.id, "IN_PROCUREMENT", { status: req.status }, { status: "IN_PROCUREMENT" });

    revalidatePath("/procurement-queue");
    revalidatePath("/requisitions");
    return { ok: true, data: {} };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const revisionSchema = z.object({
  requisitionId: z.string().min(1),
  justification: z
    .string()
    .trim()
    .min(20, "Justification (min 20 characters) is required for revised sanction"),
});

/**
 * Sends the case back into the approval chain as a REVISED SANCTION request:
 * to ADM (status OC_APPROVED) or to DM (status ADM_APPROVED) when the
 * original finalLevel was DM or the case is splitting-flagged. On approval,
 * sanctionedTotal updates to the procured amount and the case returns to the
 * NDC queue as APPROVED.
 */
export async function requestRevisedSanction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC can send a case for revised sanction." };
    }
    const data = revisionSchema.parse(input);

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: data.requisitionId },
      include: { procurement: true },
    });
    if (req.status !== "APPROVED" || !req.procurement) {
      return { ok: false, error: "Record the procurement outcome first." };
    }

    const sanction = Number(req.sanctionedTotal ?? req.estimatedTotal);
    const procured = Number(req.procurement.procuredAmount);
    const tolerancePct = await getSettingNumber("EST_TOLERANCE_PCT");
    if (procured <= sanction * (1 + tolerancePct / 100)) {
      return { ok: false, error: "Amount is within tolerance — confirm the procurement instead." };
    }

    const toDm = req.finalLevel === "DM" || !!req.routedToDmReason;
    const nextStatus = toDm ? ("ADM_APPROVED" as const) : ("OC_APPROVED" as const);
    const overPct = Math.round(((procured - sanction) / sanction) * 1000) / 10;

    await prisma.$transaction(async (tx) => {
      // One live revision request per requisition — refresh if re-sent.
      const existing = await tx.flag.findFirst({
        where: {
          entityType: "Requisition",
          entityId: req.id,
          flagType: "ESTIMATE_EXCEEDED",
          severity: "CRITICAL",
          acknowledgedAt: null,
        },
      });
      const details = {
        pendingRevision: true,
        oldSanction: sanction,
        newAmount: procured,
        overPct,
        justification: data.justification,
        requestedBy: user.name,
        bannerText: `REVISED SANCTION REQUEST — procured ₹${inr(procured)} exceeds sanction ₹${inr(sanction)} by ${overPct}%. Justification: ${data.justification}`,
      };
      if (existing) {
        await tx.flag.update({ where: { id: existing.id }, data: { details } });
      } else {
        await tx.flag.create({
          data: {
            entityType: "Requisition",
            entityId: req.id,
            flagType: "ESTIMATE_EXCEEDED",
            severity: "CRITICAL",
            details,
          },
        });
      }
      await tx.requisition.update({
        where: { id: req.id },
        data: { status: nextStatus },
      });
    });
    await logAudit(
      user.id,
      "Requisition",
      req.id,
      "REVISED_SANCTION_REQUESTED",
      { status: req.status, sanctionedTotal: sanction },
      { status: nextStatus, requestedAmount: procured, justification: data.justification },
    );

    revalidatePath("/procurement-queue");
    revalidatePath("/approvals");
    revalidatePath("/requisitions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Inline vendor creation + attachments
// ---------------------------------------------------------------------------

const inlineVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  bankAccountNo: z.string().trim().optional(),
  ifsc: z.string().trim().optional(),
});

export async function addVendorInline(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "procurement");
    const data = inlineVendorSchema.parse(input);
    const created = await prisma.vendor.create({
      data: {
        name: data.name,
        gstin: data.gstin || null,
        pan: data.pan || null,
        bankAccountNo: data.bankAccountNo || null,
        ifsc: data.ifsc || null,
      },
    });
    await logAudit(user.id, "Vendor", created.id, "CREATE_INLINE", null, created);
    revalidatePath("/vendors");
    return { ok: true, data: { id: created.id, name: created.name } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function uploadProcurementAttachment(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "procurement");
    const requisitionId = String(formData.get("requisitionId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const file = formData.get("file");
    if (!requisitionId || !label || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a file and give it a label." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "File too large (max 10 MB)." };
    }

    const path = await uploadAttachmentFile("Requisition", requisitionId, file);
    const attachment = await prisma.attachment.create({
      data: {
        entityType: "Requisition",
        entityId: requisitionId,
        label,
        fileUrl: path,
        uploadedById: user.id,
      },
    });
    await logAudit(user.id, "Attachment", attachment.id, "CREATE", null, attachment);

    revalidatePath(`/procurement-queue/${requisitionId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getAttachmentUrl(
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

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => i.message).join("; ");
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
