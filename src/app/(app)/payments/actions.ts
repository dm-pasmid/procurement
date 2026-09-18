"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const paymentSchema = z.object({
  billId: z.string().min(1),
  voucherNumber: z.string().trim().min(1, "Voucher number is required"),
  voucherDate: z.string().min(1, "Voucher date is required"),
  amountPaid: z.coerce.number().positive("Amount must be greater than 0"),
  mode: z.string().trim().optional(),
  remarks: z.string().trim().optional(),
});

/**
 * Records an offline payment outcome against a memo-generated bill.
 * Part payments allowed; cumulative paid can never exceed netPayable (hard).
 */
export async function recordPayment(
  input: unknown,
): Promise<ActionResult<{ status: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "create", "payment");
    const data = paymentSchema.parse(input);

    const bill = await prisma.bill.findUniqueOrThrow({
      where: { id: data.billId },
      include: { payments: true },
    });
    if (bill.status === "ENTERED") {
      return { ok: false, error: "Generate the Bill Passing Memo before recording payment." };
    }
    if (bill.status === "PAID") {
      return { ok: false, error: "This bill is already fully paid." };
    }

    const paidSoFar = bill.payments.reduce(
      (sum, p) => sum + Number(p.amountPaid),
      0,
    );
    const net = Number(bill.netPayable);
    const inr = (n: number) =>
      new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);
    if (paidSoFar + data.amountPaid > net + 1e-9) {
      return {
        ok: false,
        error: `Payment of ₹${inr(data.amountPaid)} would exceed the net payable ₹${inr(net)} (already paid ₹${inr(paidSoFar)}).`,
      };
    }

    const nowPaid = paidSoFar + data.amountPaid;
    const newStatus = Math.abs(nowPaid - net) < 1e-9 ? "PAID" : "PART_PAID";

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          billId: bill.id,
          voucherNumber: data.voucherNumber,
          voucherDate: new Date(data.voucherDate),
          amountPaid: new Prisma.Decimal(data.amountPaid.toFixed(2)),
          mode: data.mode || null,
          remarks: data.remarks || null,
          enteredById: user.id,
        },
      });
      await tx.bill.update({
        where: { id: bill.id },
        data: { status: newStatus },
      });
      return created;
    });
    await logAudit(user.id, "Payment", payment.id, "CREATE", null, {
      ...payment,
      billStatus: newStatus,
      paidCumulative: nowPaid,
    });
    await logAudit(user.id, "Bill", bill.id, `PAYMENT_${newStatus}`, {
      status: bill.status,
      paidSoFar,
    }, { status: newStatus, paidCumulative: nowPaid });

    revalidatePath("/payments");
    revalidatePath("/bills");
    revalidatePath(`/bills/${bill.id}`);
    return { ok: true, data: { status: newStatus } };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : e instanceof Error
            ? e.message
            : "Something went wrong",
    };
  }
}
