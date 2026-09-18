"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

// --------------------------------------------------------------------------
// Sections
// --------------------------------------------------------------------------

const sectionSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(10, "Code must be 10 characters or fewer")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required"),
});

export async function saveSection(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "section");
    const data = sectionSchema.parse(input);

    if (data.id) {
      const before = await prisma.section.findUniqueOrThrow({
        where: { id: data.id },
      });
      const after = await prisma.section.update({
        where: { id: data.id },
        data: { code: data.code, name: data.name },
      });
      await logAudit(user.id, "Section", data.id, "UPDATE", before, after);
    } else {
      const created = await prisma.section.create({
        data: { code: data.code, name: data.name },
      });
      await logAudit(user.id, "Section", created.id, "CREATE", null, created);
    }

    revalidatePath("/sections-users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setSectionActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "section");

    const before = await prisma.section.findUniqueOrThrow({ where: { id } });
    const after = await prisma.section.update({
      where: { id },
      data: { active },
    });
    await logAudit(
      user.id,
      "Section",
      id,
      active ? "ACTIVATE" : "DEACTIVATE",
      before,
      after,
    );

    revalidatePath("/sections-users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// --------------------------------------------------------------------------
// Users
// --------------------------------------------------------------------------

const createUserSchema = z.object({
  email: z.email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Name is required"),
  designation: z.string().trim().min(1, "Designation is required"),
  role: z.enum(Role),
  sectionId: z.string().min(1, "Section is required"),
  /** Sections this ADM is in charge of (role ADM only). */
  admSectionIds: z.array(z.string()).optional(),
});

/**
 * Replaces an ADM's section-charge mapping; clears it when the role is not
 * ADM. Audit-logged with the before/after section lists.
 */
async function syncAdmSections(
  actorId: string,
  profileId: string,
  role: Role,
  admSectionIds: string[] | undefined,
): Promise<void> {
  const before = await prisma.admSection.findMany({
    where: { admId: profileId },
    select: { sectionId: true },
  });
  const beforeIds = before.map((m) => m.sectionId).sort();
  const afterIds = role === "ADM" ? [...new Set(admSectionIds ?? [])].sort() : [];

  if (beforeIds.join() === afterIds.join()) return;

  await prisma.$transaction(async (tx) => {
    await tx.admSection.deleteMany({ where: { admId: profileId } });
    if (afterIds.length > 0) {
      await tx.admSection.createMany({
        data: afterIds.map((sectionId) => ({ admId: profileId, sectionId })),
      });
    }
  });
  await logAudit(
    actorId,
    "Profile",
    profileId,
    "ADM_SECTIONS_SET",
    { sectionIds: beforeIds },
    { sectionIds: afterIds },
  );
}

const updateUserSchema = createUserSchema
  .omit({ email: true, password: true })
  .extend({ id: z.string().min(1) });

export async function createUser(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "user");
    const data = createUserSchema.parse(input);

    const admin = createSupabaseAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) {
      return { ok: false, error: `Auth user creation failed: ${error.message}` };
    }

    try {
      const profile = await prisma.profile.create({
        data: {
          id: created.user.id,
          name: data.name,
          designation: data.designation,
          role: data.role,
          sectionId: data.sectionId,
        },
      });
      await logAudit(user.id, "Profile", profile.id, "CREATE", null, {
        ...profile,
        email: data.email,
      });
      await syncAdmSections(user.id, profile.id, data.role, data.admSectionIds);
    } catch (e) {
      // Keep auth and profile in step — roll the auth user back.
      await admin.auth.admin.deleteUser(created.user.id);
      throw e;
    }

    revalidatePath("/sections-users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "user");
    const data = updateUserSchema.parse(input);

    const before = await prisma.profile.findUniqueOrThrow({
      where: { id: data.id },
    });
    const after = await prisma.profile.update({
      where: { id: data.id },
      data: {
        name: data.name,
        designation: data.designation,
        role: data.role,
        sectionId: data.sectionId,
      },
    });
    await logAudit(user.id, "Profile", data.id, "UPDATE", before, after);
    await syncAdmSections(user.id, data.id, data.role, data.admSectionIds);

    revalidatePath("/sections-users");
    revalidatePath("/approvals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "user");

    if (id === user.id && !active) {
      return { ok: false, error: "You cannot deactivate your own account." };
    }

    const before = await prisma.profile.findUniqueOrThrow({ where: { id } });
    const after = await prisma.profile.update({
      where: { id },
      data: { active },
    });
    await logAudit(
      user.id,
      "Profile",
      id,
      active ? "ACTIVATE" : "DEACTIVATE",
      before,
      after,
    );

    revalidatePath("/sections-users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "manage", "user");

    if (newPassword.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters" };
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, {
      password: newPassword,
    });

    if (error) {
      return { ok: false, error: `Failed to reset password: ${error.message}` };
    }

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id } });
    await logAudit(user.id, "Profile", id, "PASSWORD_RESET", profile, profile);

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
    return "A record with this unique value already exists.";
  }
  return e instanceof Error ? e.message : "Something went wrong";
}
