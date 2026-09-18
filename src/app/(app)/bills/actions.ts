"use server";

import { revalidatePath } from "next/cache";
import { DeductionType, Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/authz";
import { allocateNumber, deriveFy } from "@/lib/numbering";
import { prisma } from "@/lib/prisma";
import { signedAttachmentUrl, uploadAttachmentFile } from "@/lib/storage";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Hard-gate refusal — the exact control this system exists to enforce. */
const NO_GRN_MESSAGE =
  "No goods receipt has been certified against this Supply Order. Bill cannot be processed.";

// ---------------------------------------------------------------------------
// SO lookup for bill entry
// ---------------------------------------------------------------------------

export interface BillSoLine {
  soItemId: string;
  description: string;
  unit: string;
  soRate: number;
  gstPercent: number;
  ordered: number;
  /** Accepted across countersigned GRNs. */
  acceptedCum: number;
  /** payableQty already consumed by earlier bills of this SO. */
  alreadyBilled: number;
}

export interface BillSoData {
  soId: string;
  soNumber: string;
  vendorName: string;
  grnNumbers: string[];
  priorBillCount: number;
  priorPayableTotal: number;
  lines: BillSoLine[];
}

async function loadBillSoData(
  soId: string,
  excludeBillId?: string,
): Promise<BillSoData | { refusal: string }> {
  const so = await prisma.supplyOrder.findUniqueOrThrow({
    where: { id: soId },
    include: {
      vendor: true,
      items: true,
      grns: { where: { status: "COUNTERSIGNED" }, include: { items: true } },
      bills: {
        where: excludeBillId ? { id: { not: excludeBillId } } : undefined,
        include: { items: true },
      },
    },
  });
  // The critical control: no countersigned GRN → no bill.
  if (so.grns.length === 0) return { refusal: NO_GRN_MESSAGE };

  const acceptedFor = (soItemId: string) =>
    so.grns.reduce(
      (sum, grn) =>
        sum +
        grn.items
          .filter((g) => g.soItemId === soItemId)
          .reduce((s, g) => s + Number(g.qtyAccepted), 0),
      0,
    );
  const billedFor = (soItemId: string) =>
    so.bills.reduce(
      (sum, bill) =>
        sum +
        bill.items
          .filter((b) => b.soItemId === soItemId)
          .reduce((s, b) => s + Number(b.payableQty), 0),
      0,
    );

  return {
    soId: so.id,
    soNumber: so.soNumber,
    vendorName: so.vendor.name,
    grnNumbers: so.grns.map((g) => g.grnNumber),
    priorBillCount: so.bills.length,
    priorPayableTotal: so.bills.reduce(
      (sum, b) => sum + Number(b.computedPayable),
      0,
    ),
    lines: so.items.map((line) => ({
      soItemId: line.id,
      description: line.description,
      unit: line.unit,
      soRate: Number(line.rate),
      gstPercent: Number(line.gstPercent),
      ordered: Number(line.qty),
      acceptedCum: acceptedFor(line.id),
      alreadyBilled: billedFor(line.id),
    })),
  };
}

export async function lookupSoForBill(
  soNumber: string,
): Promise<ActionResult<BillSoData>> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "bill");
    const so = await prisma.supplyOrder.findFirst({
      where: { soNumber: soNumber.trim() },
    });
    if (!so) return { ok: false, error: `No supply order found for “${soNumber.trim()}”.` };
    if (so.soNumber.startsWith("DRAFT-")) {
      return { ok: false, error: "This supply order has not been issued." };
    }
    const data = await loadBillSoData(so.id);
    if ("refusal" in data) return { ok: false, error: data.refusal };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Save bill — the three-way match runs here, fully automatic
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  soItemId: z.string().min(1),
  billedQty: z.coerce.number().min(0),
  billedRate: z.coerce.number().min(0),
});

const deductionSchema = z.object({
  type: z.enum(DeductionType),
  amount: z.coerce.number().positive("Deduction amount must be greater than 0"),
  remarks: z.string().trim().optional(),
});

const billSchema = z.object({
  id: z.string().optional(),
  soId: z.string().min(1),
  vendorBillNumber: z.string().trim().min(1, "Vendor bill number is required"),
  vendorBillDate: z.string().min(1, "Vendor bill date is required"),
  lines: z.array(lineSchema).min(1),
  deductions: z.array(deductionSchema),
});

const DEDUCTION_LABELS: Record<DeductionType, string> = {
  SECURITY_DEPOSIT: "Security Deposit",
  LD_PENALTY: "LD / Penalty",
  TDS_IT: "TDS (IT)",
  TDS_GST: "TDS (GST)",
  OTHER: "Other",
};

export async function saveBill(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = billSchema.parse(input);
    assertCan(user, data.id ? "update" : "create", "bill");

    if (data.id) {
      const existing = await prisma.bill.findUniqueOrThrow({ where: { id: data.id } });
      if (existing.status !== "ENTERED") {
        return { ok: false, error: "The memo has been generated — this bill is frozen." };
      }
    }

    // Deduction rule: remarks mandatory for LD and Other. Amounts are manual
    // by design — the system records and totals them, never computes them.
    for (const d of data.deductions) {
      if ((d.type === "LD_PENALTY" || d.type === "OTHER") && !d.remarks) {
        return {
          ok: false,
          error: `${DEDUCTION_LABELS[d.type]} deduction requires remarks.`,
        };
      }
    }

    const soData = await loadBillSoData(data.soId, data.id);
    if ("refusal" in soData) return { ok: false, error: soData.refusal };
    const lineBy = new Map(soData.lines.map((l) => [l.soItemId, l]));

    // ---- three-way match: SO vs GRN vs vendor bill ----
    const inr = (n: number) => new Intl.NumberFormat("en-IN").format(n);
    let claimed = 0;
    let computedPayable = 0;
    const itemRows: Prisma.BillItemUncheckedCreateWithoutBillInput[] = [];
    const billedLines = data.lines.filter((l) => l.billedQty > 0);
    if (billedLines.length === 0) {
      return { ok: false, error: "Enter a billed quantity on at least one line." };
    }
    for (const line of billedLines) {
      const so = lineBy.get(line.soItemId);
      if (!so) return { ok: false, error: "Line does not belong to this SO." };
      if (line.billedRate <= 0) {
        return { ok: false, error: `${so.description}: billed rate is required.` };
      }

      const available = Math.max(0, so.acceptedCum - so.alreadyBilled);
      const payableQty = Math.min(line.billedQty, available);
      const qtyCapped = payableQty < line.billedQty - 1e-9;
      const rateCapped = line.billedRate > so.soRate + 1e-9;
      // Never above the SO rate; never above what the vendor billed.
      const payableRate = Math.min(line.billedRate, so.soRate);

      const notes: string[] = [];
      if (qtyCapped) {
        notes.push(
          `Billed ${line.billedQty}, accepted ${available}, ${payableQty} payable`,
        );
      }
      if (rateCapped) {
        notes.push(
          `Billed ₹${inr(line.billedRate)} vs SO rate ₹${inr(so.soRate)} — computed at ₹${inr(so.soRate)}`,
        );
      }

      const gstFactor = 1 + so.gstPercent / 100;
      claimed += line.billedQty * line.billedRate * gstFactor;
      computedPayable += payableQty * payableRate * gstFactor;

      itemRows.push({
        soItemId: line.soItemId,
        billedQty: new Prisma.Decimal(line.billedQty.toFixed(3)),
        billedRate: new Prisma.Decimal(line.billedRate.toFixed(2)),
        payableQty: new Prisma.Decimal(payableQty.toFixed(3)),
        payableRate: new Prisma.Decimal(payableRate.toFixed(2)),
        lineDeviations: { qtyCapped, rateCapped, notes },
      });
    }

    const deductionsTotal = data.deductions.reduce((s, d) => s + d.amount, 0);
    const netPayable = computedPayable - deductionsTotal;
    if (netPayable < 0) {
      return { ok: false, error: "Deductions exceed the computed payable amount." };
    }

    const values = {
      vendorBillNumber: data.vendorBillNumber,
      vendorBillDate: new Date(data.vendorBillDate),
      claimedAmount: new Prisma.Decimal(claimed.toFixed(2)),
      computedPayable: new Prisma.Decimal(computedPayable.toFixed(2)),
      deductionsTotal: new Prisma.Decimal(deductionsTotal.toFixed(2)),
      netPayable: new Prisma.Decimal(netPayable.toFixed(2)),
    };
    const deductionRows = data.deductions.map((d) => ({
      type: d.type,
      amount: new Prisma.Decimal(d.amount.toFixed(2)),
      remarks: d.remarks || null,
    }));

    let id: string;
    if (data.id) {
      const before = await prisma.bill.findUniqueOrThrow({
        where: { id: data.id },
        include: { items: true, deductions: true },
      });
      const updated = await prisma.$transaction(async (tx) => {
        await tx.billItem.deleteMany({ where: { billId: data.id } });
        await tx.billDeduction.deleteMany({ where: { billId: data.id } });
        return tx.bill.update({
          where: { id: data.id },
          data: {
            ...values,
            items: { create: itemRows },
            deductions: { create: deductionRows },
          },
        });
      });
      await logAudit(user.id, "Bill", data.id, "UPDATE", before, updated);
      id = data.id;
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const bill = await tx.bill.create({
          data: {
            bpmNumber: `DRAFT-${crypto.randomUUID()}`,
            soId: data.soId,
            enteredById: user.id,
            status: "ENTERED",
            ...values,
            items: { create: itemRows },
            deductions: { create: deductionRows },
          },
        });
        const so = await tx.supplyOrder.findUniqueOrThrow({
          where: { id: data.soId },
        });
        await tx.requisition.update({
          where: { id: so.requisitionId },
          data: { status: "BILL_UNDER_PROCESS" },
        });
        return bill;
      });
      await logAudit(user.id, "Bill", created.id, "CREATE", null, created);
      id = created.id;
    }

    revalidatePath("/bills");
    revalidatePath("/requisitions");
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Bill Passing Memo generation (NDC)
// ---------------------------------------------------------------------------

export async function generateMemo(
  billId: string,
): Promise<ActionResult<{ bpmNumber: string }>> {
  try {
    const user = await requireUser();
    if (user.role !== "NDC") {
      return { ok: false, error: "Only the NDC generates the Bill Passing Memo." };
    }

    const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId } });
    if (bill.status !== "ENTERED") {
      return { ok: false, error: "The memo has already been generated." };
    }

    const fy = deriveFy();
    const updated = await prisma.$transaction(async (tx) => {
      const bpmNumber = bill.bpmNumber.startsWith("DRAFT-")
        ? await allocateNumber("BPM", fy, tx)
        : bill.bpmNumber;
      return tx.bill.update({
        where: { id: billId },
        data: { bpmNumber, status: "MEMO_GENERATED" },
      });
    });
    await logAudit(user.id, "Bill", billId, "MEMO_GENERATED", { status: "ENTERED" }, {
      status: "MEMO_GENERATED",
      bpmNumber: updated.bpmNumber,
    });

    revalidatePath("/bills");
    return { ok: true, data: { bpmNumber: updated.bpmNumber } };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Scanned bill attachment
// ---------------------------------------------------------------------------

export async function uploadBillAttachment(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "update", "bill");
    const billId = String(formData.get("billId") ?? "");
    const label = String(formData.get("label") ?? "").trim() || "Vendor bill (scan)";
    const file = formData.get("file");
    if (!billId || !(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a file to upload." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "File too large (max 10 MB)." };
    }
    await prisma.bill.findUniqueOrThrow({ where: { id: billId } });

    const path = await uploadAttachmentFile("Bill", billId, file);
    const attachment = await prisma.attachment.create({
      data: {
        entityType: "Bill",
        entityId: billId,
        label,
        fileUrl: path,
        uploadedById: user.id,
      },
    });
    await logAudit(user.id, "Attachment", attachment.id, "CREATE", null, attachment);
    revalidatePath(`/bills/${billId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function getBillAttachmentUrl(
  attachmentId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const user = await requireUser();
    if (!can(user, "view", "bill")) {
      return { ok: false, error: "Not authorised" };
    }
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
