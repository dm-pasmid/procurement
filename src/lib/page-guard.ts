import "server-only";
import { redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { homeRoute } from "@/lib/authz";
import { canViewRoute } from "@/lib/navigation";

/**
 * Server-side gate for every page in the authenticated shell.
 * Redirects to login / account-disabled / the role's home as appropriate,
 * and returns the current user for the page to use.
 */
export async function requirePageAccess(href: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canViewRoute(user.role, href)) {
    redirect(homeRoute(user.role));
  }
  return user;
}
