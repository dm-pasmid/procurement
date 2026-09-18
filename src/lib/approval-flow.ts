import type { ApprovalLevel, ReqStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Text stored on each flag when the approver ticks the acknowledgement. */
export const ACK_TEXT =
  "I have seen the integrity checks and flags listed for this requisition and choose to proceed.";

/** Which approval level acts on a requisition in this status. */
export function pendingLevelFor(status: ReqStatus): ApprovalLevel | null {
  switch (status) {
    case "SUBMITTED":
      return "OC";
    case "OC_APPROVED":
      return "ADM";
    case "ADM_APPROVED":
      return "DM";
    default:
      return null;
  }
}

/** True when this user is the approver the case is currently waiting on. */
export function isPendingApprover(
  user: { role: Role; sectionId: string },
  req: { status: ReqStatus; sectionId: string },
): boolean {
  const level = pendingLevelFor(req.status);
  if (!level) return false;
  if (level === "OC") {
    return user.role === "OC" && user.sectionId === req.sectionId;
  }
  return user.role === (level as string);
}

/**
 * ADM charge check: an ADM acts on a section they are mapped to in
 * Sections & Users. A section mapped to no ADM at all falls back to every
 * ADM, so a missing mapping can never stall a case.
 */
export async function admActsForSection(
  admId: string,
  sectionId: string,
): Promise<boolean> {
  const mapped = await prisma.admSection.findFirst({
    where: { admId, sectionId },
    select: { id: true },
  });
  if (mapped) return true;
  const anyMapping = await prisma.admSection.findFirst({
    where: { sectionId },
    select: { id: true },
  });
  return !anyMapping;
}
