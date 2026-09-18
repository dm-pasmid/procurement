import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Writes one append-only AuditLog row. Call from every mutation.
 *
 * `actor` is the Profile id (Supabase auth user id) of the person performing
 * the action, or null for system-generated changes (e.g. scheduled flag runs).
 * Pass the surrounding transaction client as `tx` so the audit row commits or
 * rolls back together with the mutation it records.
 */
export async function logAudit(
  actor: string | null,
  entityType: string,
  entityId: string,
  action: string,
  before?: unknown,
  after?: unknown,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  await db.auditLog.create({
    data: {
      actorId: actor,
      entityType,
      entityId,
      action,
      before: before === undefined ? Prisma.DbNull : (before as Prisma.InputJsonValue),
      after: after === undefined ? Prisma.DbNull : (after as Prisma.InputJsonValue),
    },
  });
}
