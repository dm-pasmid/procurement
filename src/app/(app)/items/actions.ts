"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ActionResult = { ok: true } | { ok: false; error: string };

const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().min(1, "Category is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  specTemplate: z.string().trim().optional(),
});

export async function saveItem(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "item");
    const data = itemSchema.parse(input);
    const values = {
      name: data.name,
      category: data.category,
      unit: data.unit,
      specTemplate: data.specTemplate || null,
    };

    if (data.id) {
      const before = await prisma.item.findUniqueOrThrow({
        where: { id: data.id },
      });
      const after = await prisma.item.update({
        where: { id: data.id },
        data: values,
      });
      await logAudit(user.id, "Item", data.id, "UPDATE", before, after);
    } else {
      const created = await prisma.item.create({ data: values });
      await logAudit(user.id, "Item", created.id, "CREATE", null, created);
    }

    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setItemActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "item");

    const before = await prisma.item.findUniqueOrThrow({ where: { id } });
    const after = await prisma.item.update({ where: { id }, data: { active } });
    await logAudit(
      user.id,
      "Item",
      id,
      active ? "ACTIVATE" : "DEACTIVATE",
      before,
      after,
    );

    revalidatePath("/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues.map((i) => i.message).join("; ");
  }
  if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
    return "An item with this name and unit already exists.";
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
