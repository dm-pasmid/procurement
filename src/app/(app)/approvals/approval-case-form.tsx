"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { actOnRequisition } from "./actions";

export interface CaseLine {
  id: string;
  label: string;
  nonMaster: boolean;
  specification: string | null;
  unit: string;
  qty: number;
  estRate: number;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/**
 * Item table + action bar for the approval screen. The pending approver may
 * revise line quantities; revisions apply together with an Approve action and
 * are audit-logged. Return/Reject send the case back unchanged.
 */
export function ApprovalCaseForm({
  requisitionId,
  level,
  canAct,
  requiresAck,
  ackText,
  openFlagCount,
  admLimit,
  splittingForced,
  lines,
}: {
  requisitionId: string;
  level: string | null;
  canAct: boolean;
  requiresAck: boolean;
  ackText: string;
  openFlagCount: number;
  admLimit: number;
  splittingForced: boolean;
  lines: CaseLine[];
}) {
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, String(l.qty)])),
  );
  const [remarks, setRemarks] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();

  const anyModified = lines.some((l) => Number(qtys[l.id]) !== l.qty);
  const liveTotal = lines.reduce(
    (sum, l) => sum + (Number(qtys[l.id]) || 0) * l.estRate,
    0,
  );
  const liveLevel = splittingForced ? "DM" : liveTotal <= admLimit ? "ADM" : "DM";

  function act(action: "APPROVE" | "RETURN" | "REJECT") {
    if ((action === "RETURN" || action === "REJECT") && !remarks.trim()) {
      toast.error("Remarks are mandatory for Return and Reject.");
      return;
    }
    if (action === "APPROVE") {
      if (requiresAck && !acknowledged) {
        toast.error("Tick the acknowledgement to approve with open flags.");
        return;
      }
      for (const line of lines) {
        if (!(Number(qtys[line.id]) > 0)) {
          toast.error(`${line.label}: revised quantity must be greater than 0.`);
          return;
        }
      }
    }
    startTransition(async () => {
      const result = await actOnRequisition({
        requisitionId,
        action,
        remarks: remarks.trim() || undefined,
        acknowledged,
        quantities:
          action === "APPROVE" && anyModified
            ? Object.fromEntries(
                lines
                  .filter((l) => Number(qtys[l.id]) !== l.qty)
                  .map((l) => [l.id, Number(qtys[l.id])]),
              )
            : undefined,
      });
      if (result.ok) {
        toast.success(
          action === "APPROVE"
            ? anyModified
              ? "Approved with revised quantities"
              : "Approved"
            : action === "RETURN"
              ? "Returned to initiator"
              : "Rejected",
        );
        router.push("/approvals");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Item-wise estimate
            {canAct && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                — quantities may be revised before approval
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Sl</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="w-32 text-right">Qty</TableHead>
                  <TableHead className="text-right">Est. rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => {
                  const modified = Number(qtys[line.id]) !== line.qty;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {line.label}
                        {line.nonMaster && (
                          <Badge className="ml-2 bg-warning text-warning-foreground">
                            non-master
                          </Badge>
                        )}
                        {line.specification && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {line.specification}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{line.unit}</TableCell>
                      <TableCell className="text-right">
                        {canAct ? (
                          <div className="flex items-center justify-end gap-1">
                            {modified && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label={`Reset ${line.label} to indented quantity`}
                                onClick={() =>
                                  setQtys((p) => ({
                                    ...p,
                                    [line.id]: String(line.qty),
                                  }))
                                }
                              >
                                <RotateCcw className="size-3" />
                              </Button>
                            )}
                            <div>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={qtys[line.id]}
                                onChange={(e) =>
                                  setQtys((p) => ({
                                    ...p,
                                    [line.id]: e.target.value,
                                  }))
                                }
                                aria-label={`Quantity for ${line.label}`}
                                className={cn(
                                  "h-8 w-24 text-right tabular-nums",
                                  modified && "border-warning bg-warning/10",
                                )}
                              />
                              {modified && (
                                <p className="mt-0.5 text-right text-xs text-warning">
                                  indented: {line.qty}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="tabular-nums">{line.qty}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {inr.format(line.estRate)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {inr.format((Number(qtys[line.id]) || 0) * line.estRate)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-medium">
                    Total estimate
                    {anyModified && (
                      <span className="ml-1 text-xs font-normal text-warning">
                        (revised)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-primary">
                    {inr.format(liveTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {canAct && anyModified && (
            <p className="mt-2 text-xs text-muted-foreground">
              Revised total {inr.format(liveTotal)} —{" "}
              {splittingForced
                ? "final approval stays with DM (splitting suspect)."
                : `final approval: ${liveLevel} (limit ₹${admLimit.toLocaleString("en-IN")}).`}{" "}
              Revisions are recorded in the approval history and audit log.
            </p>
          )}
        </CardContent>
      </Card>

      {canAct && level && (
        <div className="space-y-4 rounded-md border bg-muted/40 p-4">
          <p className="text-sm font-semibold text-primary">
            Action — {level} level
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="approval-remarks">
              Remarks{" "}
              <span className="text-muted-foreground">
                (mandatory for Return / Reject)
              </span>
            </Label>
            <Textarea
              id="approval-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {requiresAck && (
            <label className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
                aria-label="Acknowledge integrity flags"
                className="mt-0.5"
              />
              <span>
                {ackText}{" "}
                <span className="text-muted-foreground">
                  ({openFlagCount} open flag{openFlagCount === 1 ? "" : "s"})
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => act("RETURN")}
            >
              Return
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => act("REJECT")}
            >
              Reject
            </Button>
            <Button disabled={isPending} onClick={() => act("APPROVE")}>
              {isPending
                ? "Working…"
                : anyModified
                  ? "Approve with revised quantities"
                  : "Approve"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
