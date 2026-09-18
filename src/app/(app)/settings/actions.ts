"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ActionResult = { ok: true } | { ok: false; error: string };

const updateSchema = z.object({
  key: z.string().min(1),
  value: z
    .string()
    .trim()
    .min(1, "Value is required")
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), {
      message: "Value must be numeric",
    }),
});

export async function updateSetting(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "setting");
    const data = updateSchema.parse(input);

    const before = await prisma.setting.findUniqueOrThrow({
      where: { key: data.key },
    });
    const after = await prisma.setting.update({
      where: { key: data.key },
      data: { value: data.value },
    });
    await logAudit(user.id, "Setting", data.key, "UPDATE", before, after);

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues.map((i) => i.message).join("; ") };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
