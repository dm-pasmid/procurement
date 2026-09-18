"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ActionResult = { ok: true } | { ok: false; error: string };

const vendorSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Name is required"),
    gstin: z.string().trim().optional(),
    pan: z.string().trim().optional(),
    bankAccountNo: z.string().trim().optional(),
    ifsc: z.string().trim().optional(),
    address: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || z.email().safeParse(v).success, {
        message: "Invalid email",
      }),
    empanelled: z.boolean(),
    empanelmentRef: z.string().trim().optional(),
    empanelmentValidTill: z.string().trim().optional(), // yyyy-mm-dd
  })
  .refine((v) => !v.empanelled || !!v.empanelmentRef, {
    message: "Empanelment reference is required when empanelled",
  })
  .refine((v) => !v.empanelled || !!v.empanelmentValidTill, {
    message: "Empanelment validity date is required when empanelled",
  });

export async function saveVendor(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "vendor");
    const data = vendorSchema.parse(input);

    const values = {
      name: data.name,
      gstin: data.gstin || null,
      pan: data.pan || null,
      bankAccountNo: data.bankAccountNo || null,
      ifsc: data.ifsc || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      empanelled: data.empanelled,
      empanelmentRef: data.empanelled ? data.empanelmentRef! : null,
      empanelmentValidTill: data.empanelled
        ? new Date(data.empanelmentValidTill!)
        : null,
    };

    if (data.id) {
      const before = await prisma.vendor.findUniqueOrThrow({
        where: { id: data.id },
      });
      const after = await prisma.vendor.update({
        where: { id: data.id },
        data: values,
      });
      await logAudit(user.id, "Vendor", data.id, "UPDATE", before, after);
    } else {
      const created = await prisma.vendor.create({ data: values });
      await logAudit(user.id, "Vendor", created.id, "CREATE", null, created);
    }

    revalidatePath("/vendors");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setVendorActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "vendor");

    const before = await prisma.vendor.findUniqueOrThrow({ where: { id } });
    const after = await prisma.vendor.update({
      where: { id },
      data: { active },
    });
    await logAudit(
      user.id,
      "Vendor",
      id,
      active ? "ACTIVATE" : "DEACTIVATE",
      before,
      after,
    );

    revalidatePath("/vendors");
    return { ok: true };
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
