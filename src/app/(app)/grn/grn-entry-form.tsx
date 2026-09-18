"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { lookupSoForGrn, saveGrnDraft, type GrnSoData } from "./actions";

export interface GrnFormLine {
  soItemId: string;
  qtyReceived: string;
  qtyAccepted: string;
  qtyRejected: string;
  remarks: string;
}

export interface GrnFormInitial {
  id: string;
  receiptDate: string;
  challanNumber: string;
  challanDate: string;
  remarks: string;
  lines: Record<string, GrnFormLine>; // keyed by soItemId
}

export function GrnEntryForm({
  presetSo,
  initial,
}: {
  /** SO already resolved (edit mode or deep link); otherwise show the lookup. */
  presetSo?: GrnSoData | null;
  initial?: GrnFormInitial;
}) {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState("");
  const [so, setSo] = useState<GrnSoData | null>(presetSo ?? null);
  const [receiptDate, setReceiptDate] = useState(
    initial?.receiptDate ?? new Date().toISOString().slice(0, 10),
  );
  const [challanNumber, setChallanNumber] = useState(initial?.challanNumber ?? "");
  const [challanDate, setChallanDate] = useState(initial?.challanDate ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [lines, setLines] = useState<Record<string, GrnFormLine>>(
    initial?.lines ?? {},
  );
  const [isPending, startTransition] = useTransition();

  function line(soItemId: string): GrnFormLine {
    return (
      lines[soItemId] ?? {
        soItemId,
        qtyReceived: "",
        qtyAccepted: "",
        qtyRejected: "",
        remarks: "",
      }
    );
  }

  function updateLine(soItemId: string, patch: Partial<GrnFormLine>) {
    setLines((prev) => ({ ...prev, [soItemId]: { ...line(soItemId), ...patch } }));
  }

  function handleLookup() {
    if (!soNumber.trim()) return void toast.error("Enter the SO number.");
    startTransition(async () => {
      const result = await lookupSoForGrn(soNumber);
      if (result.ok) {
        setSo(result.data!);
        setLines({});
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSave() {
    if (!so) return;
    const activeLines = so.lines
      .map((l) => line(l.soItemId))
      .filter((l) => Number(l.qtyReceived) > 0);
    if (activeLines.length === 0) {
      return void toast.error("Enter a received quantity on at least one line.");
    }
    for (const l of activeLines) {
      const soLine = so.lines.find((s) => s.soItemId === l.soItemId)!;
      const received = Number(l.qtyReceived) || 0;
      const accepted = Number(l.qtyAccepted) || 0;
      const rejected = Number(l.qtyRejected) || 0;
      if (Math.abs(accepted + rejected - received) > 1e-9) {
        return void toast.error(
          `${soLine.description}: accepted + rejected must equal received.`,
        );
      }
      if (rejected > 0 && !l.remarks.trim()) {
        return void toast.error(
          `${soLine.description}: remarks are mandatory when quantity is rejected.`,
        );
      }
      if (received > soLine.ordered - soLine.receivedSoFar + 1e-9) {
        return void toast.error(
          `${soLine.description}: received exceeds the undelivered balance (${soLine.ordered - soLine.receivedSoFar}).`,
        );
      }
    }
    startTransition(async () => {
      const result = await saveGrnDraft({
        id: initial?.id,
        soId: so.soId,
        receiptDate,
        challanNumber,
        challanDate,
        remarks,
        lines: activeLines.map((l) => ({
          soItemId: l.soItemId,
          qtyReceived: Number(l.qtyReceived) || 0,
          qtyAccepted: Number(l.qtyAccepted) || 0,
          qtyRejected: Number(l.qtyRejected) || 0,
          remarks: l.remarks,
        })),
      });
      if (result.ok) {
        toast.success("GRN saved as draft — awaiting OC countersignature");
        router.push(`/grn/${result.data!.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {!presetSo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supply order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="grn-so-number">SO number</Label>
                <Input
                  id="grn-so-number"
                  placeholder="SO/PMS/2026-27/0001"
                  className="w-72 font-mono"
                  value={soNumber}
                  onChange={(e) => setSoNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLookup();
                    }
                  }}
                />
              </div>
              <Button disabled={isPending} onClick={handleLookup}>
                <Search /> Fetch SO
              </Button>
            </div>
            {so && (
              <p className="mt-3 text-sm text-muted-foreground">
                {so.soNumber} · {so.vendorName} · delivers to{" "}
                <span className="font-medium text-foreground">
                  {so.deliverySectionName}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {so && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipt details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="grn-receipt-date">Receipt date</Label>
                <Input
                  id="grn-receipt-date"
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grn-challan-no">Challan number</Label>
                <Input
                  id="grn-challan-no"
                  value={challanNumber}
                  onChange={(e) => setChallanNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grn-challan-date">Challan date</Label>
                <Input
                  id="grn-challan-date"
                  type="date"
                  value={challanDate}
                  onChange={(e) => setChallanDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label htmlFor="grn-remarks">Remarks (optional)</Label>
                <Textarea
                  id="grn-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Lines{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  — accepted + rejected must equal received; rejection needs
                  remarks
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received so far</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="w-24 text-right">Received</TableHead>
                      <TableHead className="w-24 text-right">Accepted</TableHead>
                      <TableHead className="w-24 text-right">Rejected</TableHead>
                      <TableHead className="w-52">Line remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {so.lines.map((soLine) => {
                      const l = line(soLine.soItemId);
                      const balance = soLine.ordered - soLine.receivedSoFar;
                      const received = Number(l.qtyReceived) || 0;
                      const mismatch =
                        received > 0 &&
                        Math.abs(
                          (Number(l.qtyAccepted) || 0) +
                            (Number(l.qtyRejected) || 0) -
                            received,
                        ) > 1e-9;
                      return (
                        <TableRow key={soLine.soItemId}>
                          <TableCell className="font-medium">
                            {soLine.description}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {soLine.unit}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {soLine.ordered}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {soLine.receivedSoFar}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular-nums",
                              balance === 0 && "text-muted-foreground",
                            )}
                          >
                            {balance}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={balance}
                              step="any"
                              className={cn("h-8 text-right", mismatch && "border-warning bg-warning/10")}
                              value={l.qtyReceived}
                              disabled={balance === 0}
                              onChange={(e) =>
                                updateLine(soLine.soItemId, {
                                  qtyReceived: e.target.value,
                                  // sensible default: everything accepted
                                  qtyAccepted: e.target.value,
                                  qtyRejected: "0",
                                })
                              }
                              aria-label={`Received ${soLine.description}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className={cn("h-8 text-right", mismatch && "border-warning bg-warning/10")}
                              value={l.qtyAccepted}
                              disabled={balance === 0}
                              onChange={(e) =>
                                updateLine(soLine.soItemId, { qtyAccepted: e.target.value })
                              }
                              aria-label={`Accepted ${soLine.description}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className={cn("h-8 text-right", mismatch && "border-warning bg-warning/10")}
                              value={l.qtyRejected}
                              disabled={balance === 0}
                              onChange={(e) =>
                                updateLine(soLine.soItemId, { qtyRejected: e.target.value })
                              }
                              aria-label={`Rejected ${soLine.description}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              value={l.remarks}
                              disabled={balance === 0}
                              placeholder={
                                Number(l.qtyRejected) > 0 ? "Required for rejection" : ""
                              }
                              onChange={(e) =>
                                updateLine(soLine.soItemId, { remarks: e.target.value })
                              }
                              aria-label={`Remarks ${soLine.description}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button disabled={isPending} onClick={handleSave}>
              {isPending ? "Saving…" : initial ? "Save changes" : "Save GRN draft"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
