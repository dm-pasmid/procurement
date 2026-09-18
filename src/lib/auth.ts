import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  designation: string;
  role: Role;
  sectionId: string;
  sectionCode: string;
  sectionName: string;
  active: boolean;
}

/**
 * Loads the authenticated user's Profile (role, section). Cached per request.
 * Returns null when there is no session or no linked Profile.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    include: { section: true },
  });
  if (!profile) return null;

  return {
    id: profile.id,
    email: user.email ?? "",
    name: profile.name,
    designation: profile.designation,
    role: profile.role,
    sectionId: profile.sectionId,
    sectionCode: profile.section.code,
    sectionName: profile.section.name,
    active: profile.active,
  };
});

/**
 * For pages and server actions inside the authenticated shell.
 * Redirects to /login without a session and to /account-disabled when
 * the profile has been deactivated.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/account-disabled");
  return user;
}
