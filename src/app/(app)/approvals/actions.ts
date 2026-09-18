"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ReqStatus } from "@prisma/client";
import { z } from "zod";
import {
  ACK_TEXT,
  admActsForSection,
  isPendingApprover,
  pendingLevelFor,
} from "@/lib/approval-flow";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const actionSchema = z.object({
  requisitionId: z.string().min(1),
  action: z.enum(["APPROVE", "RETURN", "REJECT"]),
  remarks: z.string().trim().optional(),
  acknowledged: z.boolean().optional(),
  /** Line-quantity revisions by the approver, keyed by RequisitionItem id.
   *  Applied only with APPROVE; Return/Reject send the case back instead. */
  quantities: z.record(z.string(), z.coerce.number().positive()).optional(),
});

export async function actOnRequisition(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = actionSchema.parse(input);

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: data.requisitionId },
    });

    const level = pendingLevelFor(req.status);
    if (!level) {
      return { ok: false, error: "This requisition is not awaiting approval." };
    }
    if (!isPendingApprover(user, req)) {
      return { ok: false, error: "This case is not pending at your level." };
    }
    if (level === "ADM" && !(await admActsForSection(user.id, req.sectionId))) {
      return { ok: false, error: "This section is not under your charge." };
    }
    if (req.initiatorId === user.id) {
      return { ok: false, error: "An approver never acts on their own requisition." };
    }
    if (
      (data.action === "RETURN" || data.action === "REJECT") &&
      !data.remarks
    ) {
      return { ok: false, error: "Remarks are mandatory for Return and Reject." };
    }

    // Approving with open WARN/CRITICAL flags requires the acknowledgement
    // tick (suggestive control — never a block, but always a conscious step).
    if (data.action === "APPROVE") {
      const openFlags = await prisma.flag.findMany({
        where: {
          entityType: "Requisition",
          entityId: req.id,
          severity: { in: ["WARN", "CRITICAL"] },
          acknowledgedAt: null,
        },
      });
      if (openFlags.length > 0) {
        if (!data.acknowledged) {
          return {
            ok: false,
            error:
              "This case has open integrity flags. Tick the acknowledgement to proceed.",
          };
        }
        const now = new Date();
        await prisma.flag.updateMany({
          where: { id: { in: openFlags.map((f) => f.id) } },
          data: {
            acknowledgedById: user.id,
            acknowledgedAt: now,
            acknowledgeRemarks: ACK_TEXT,
          },
        });
        await logAudit(user.id, "Requisition", req.id, "FLAGS_ACKNOWLEDGED", null, {
          flagIds: openFlags.map((f) => f.id),
          text: ACK_TEXT,
          at: now.toISOString(),
        });
      }
    }

    // ---- approver quantity revisions (upper hierarchy may modify) ----
    // Applied only on APPROVE, inside the same transaction as the action.
    // Estimate and ADM/DM routing are recomputed; splitting-forced DM
    // routing is never undone by a quantity change.
    let qtyChanges: { id: string; label: string; from: number; to: number }[] = [];
    let newTotal = Number(req.estimatedTotal);
    let newFinalLevel = req.finalLevel;
    if (data.action === "APPROVE" && data.quantities) {
      const lines = await prisma.requisitionItem.findMany({
        where: { requisitionId: req.id },
        include: { item: true },
      });
      const lineIds = new Set(lines.map((l) => l.id));
      for (const key of Object.keys(data.quantities)) {
        if (!lineIds.has(key)) {
          return { ok: false, error: "Quantity revision refers to an unknown line." };
        }
      }
      qtyChanges = lines.flatMap((line) => {
        const to = data.quantities![line.id];
        const from = Number(line.qty);
        return to !== undefined && to !== from
          ? [
              {
                id: line.id,
                label: line.item?.name ?? line.itemNameFree ?? "item",
                from,
                to,
              },
            ]
          : [];
      });
      if (qtyChanges.length > 0) {
        newTotal = lines.reduce((sum, line) => {
          const to = data.quantities![line.id];
          const qty = to !== undefined ? to : Number(line.qty);
          return sum + qty * Number(line.estRate);
        }, 0);
        if (!req.routedToDmReason) {
          const admLimit = await getSettingNumber("ADM_LIMIT");
          newFinalLevel = newTotal <= admLimit ? "ADM" : "DM";
        }
      }
    }

    // Revised-sanction request (sent by NDC when procured amount breached
    // tolerance): approval raises the sanction to the procured amount and
    // returns the case to the NDC; Return/Reject also send it back to the
    // NDC at the old sanction — never to the initiator, never terminal.
    const revisionFlag = await prisma.flag.findFirst({
      where: {
        entityType: "Requisition",
        entityId: req.id,
        flagType: "ESTIMATE_EXCEEDED",
        severity: "CRITICAL",
        details: { path: ["pendingRevision"], equals: true },
      },
    });
    const revision = revisionFlag?.details as
      | { pendingRevision?: boolean; newAmount?: number; oldSanction?: number }
      | undefined;
    const isRevisionCase = !!revision?.pendingRevision;

    let nextStatus: ReqStatus;
    if (isRevisionCase && (data.action === "RETURN" || data.action === "REJECT")) {
      nextStatus = "APPROVED"; // back to NDC at the old sanction
    } else if (data.action === "REJECT") {
      nextStatus = "REJECTED";
    } else if (data.action === "RETURN") {
      nextStatus = "RETURNED";
    } else {
      // APPROVE
      if (level === "OC") {
        nextStatus = "OC_APPROVED";
      } else if (level === "ADM") {
        nextStatus = newFinalLevel === "ADM" ? "APPROVED" : "ADM_APPROVED";
      } else {
        nextStatus = "APPROVED";
      }
    }

    const qtyNote =
      qtyChanges.length > 0
        ? `[Quantities revised: ${qtyChanges.map((c) => `${c.label} ${c.from} → ${c.to}`).join("; ")}]`
        : "";
    const remarksWithNote =
      [data.remarks, qtyNote].filter(Boolean).join(" ") || null;

    const updated = await prisma.$transaction(async (tx) => {
      for (const change of qtyChanges) {
        await tx.requisitionItem.update({
          where: { id: change.id },
          data: { qty: new Prisma.Decimal(change.to.toFixed(3)) },
        });
      }
      await tx.approvalAction.create({
        data: {
          requisitionId: req.id,
          level,
          actorId: user.id,
          action: data.action,
          remarks: remarksWithNote,
        },
      });
      // Close out a revision request on any decision.
      if (isRevisionCase && revisionFlag) {
        await tx.flag.update({
          where: { id: revisionFlag.id },
          data: {
            details: {
              ...(revisionFlag.details as Prisma.JsonObject),
              pendingRevision: false,
              revisionOutcome:
                data.action === "APPROVE" ? "approved" : "returned_to_ndc",
            },
            // Return/Reject don't pass the ack step — stamp the decision here.
            ...(data.action !== "APPROVE"
              ? {
                  acknowledgedById: user.id,
                  acknowledgedAt: new Date(),
                  acknowledgeRemarks: `Revised sanction ${data.action === "RETURN" ? "returned" : "declined"}: ${data.remarks ?? ""}`,
                }
              : {}),
          },
        });
      }
      return tx.requisition.update({
        where: { id: req.id },
        data: {
          status: nextStatus,
          ...(qtyChanges.length > 0
            ? {
                estimatedTotal: new Prisma.Decimal(newTotal.toFixed(2)),
                finalLevel: newFinalLevel,
              }
            : {}),
          // Final approval fixes the sanctioned amount and pushes the case
          // into the procurement queue (queue = APPROVED, no Procurement yet).
          // A revised-sanction approval raises it to the procured amount.
          ...(nextStatus === "APPROVED" && data.action === "APPROVE"
            ? {
                sanctionedTotal: new Prisma.Decimal(
                  (isRevisionCase && revision?.newAmount
                    ? revision.newAmount
                    : newTotal
                  ).toFixed(2),
                ),
              }
            : {}),
        },
      });
    });
    if (qtyChanges.length > 0) {
      await logAudit(
        user.id,
        "Requisition",
        req.id,
        `QTY_MODIFIED_${level}`,
        {
          changes: qtyChanges.map((c) => ({ label: c.label, qty: c.from })),
          estimatedTotal: Number(req.estimatedTotal),
          finalLevel: req.finalLevel,
        },
        {
          changes: qtyChanges.map((c) => ({ label: c.label, qty: c.to })),
          estimatedTotal: newTotal,
          finalLevel: newFinalLevel,
        },
      );
    }
    await logAudit(
      user.id,
      "Requisition",
      req.id,
      `${data.action}_${level}`,
      { status: req.status },
      { status: updated.status, remarks: remarksWithNote },
    );

    revalidatePath("/approvals");
    revalidatePath("/requisitions");
    revalidatePath(`/requisitions/${req.id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong",
    };
  }
}
