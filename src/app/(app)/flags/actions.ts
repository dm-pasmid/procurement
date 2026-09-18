"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ackSchema = z.object({
  flagId: z.string().min(1),
  remarks: z.string().trim().min(5, "Acknowledgement remarks are required"),
});

export async function acknowledgeFlag(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "acknowledge", "flag");
    const data = ackSchema.parse(input);

    const flag = await prisma.flag.findUniqueOrThrow({ where: { id: data.flagId } });
    if (flag.acknowledgedAt) {
      return { ok: false, error: "This flag is already acknowledged." };
    }

    const updated = await prisma.flag.update({
      where: { id: flag.id },
      data: {
        acknowledgedById: user.id,
        acknowledgedAt: new Date(),
        acknowledgeRemarks: data.remarks,
      },
    });
    await logAudit(user.id, "Flag", flag.id, "ACKNOWLEDGE", flag, updated);

    revalidatePath("/flags");
    revalidatePath("/dashboard");
    return { ok: true };
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
