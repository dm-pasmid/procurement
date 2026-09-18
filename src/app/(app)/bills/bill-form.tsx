"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DeductionType } from "@prisma/client";
import { Plus, Search, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { lookupSoForBill, saveBill, type BillSoData } from "./actions";

interface BillLineInput {
  soItemId: string;
  billedQty: string;
  billedRate: string;
}

interface DeductionInput {
  key: string;
  type: DeductionType | "";
  amount: string;
  remarks: string;
}

const DEDUCTION_OPTIONS: { value: DeductionType; label: string }[] = [
  { value: "SECURITY_DEPOSIT", label: "Security Deposit" },
  { value: "LD_PENALTY", label: "LD / Penalty" },
  { value: "TDS_IT", label: "TDS (IT)" },
  { value: "TDS_GST", label: "TDS (GST)" },
  { value: "OTHER", label: "Other" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function BillForm({
  presetSo,
  initial,
}: {
  presetSo?: BillSoData | null;
  initial?: {
    id: string;
    vendorBillNumber: string;
    vendorBillDate: string;
    lines: Record<string, BillLineInput>;
    deductions: DeductionInput[];
  };
}) {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState("");
  const [so, setSo] = useState<BillSoData | null>(presetSo ?? null);
  const [vendorBillNumber, setVendorBillNumber] = useState(initial?.vendorBillNumber ?? "");
  const [vendorBillDate, setVendorBillDate] = useState(initial?.vendorBillDate ?? "");
  const [lines, setLines] = useState<Record<string, BillLineInput>>(initial?.lines ?? {});
  const [deductions, setDeductions] = useState<DeductionInput[]>(initial?.deductions ?? []);
  const [isPending, startTransition] = useTransition();

  function line(soItemId: string): BillLineInput {
    return lines[soItemId] ?? { soItemId, billedQty: "", billedRate: "" };
  }
  function updateLine(soItemId: string, patch: Partial<BillLineInput>) {
    setLines((prev) => ({ ...prev, [soItemId]: { ...line(soItemId), ...patch } }));
  }

  function handleLookup() {
    if (!soNumber.trim()) return void toast.error("Enter the SO number.");
    startTransition(async () => {
      const result = await lookupSoForBill(soNumber);
      if (result.ok) {
        setSo(result.data!);
        setLines({});
      } else {
        toast.error(result.error);
      }
    });
  }

  // ---- live three-way preview (display only; server recomputes) ----
  function preview(soItemId: string) {
    if (!so) return null;
    const soLine = so.lines.find((l) => l.soItemId === soItemId)!;
    const l = line(soItemId);
    const billedQty = Number(l.billedQty) || 0;
    const billedRate = Number(l.billedRate) || 0;
    if (billedQty <= 0) return null;
    const available = Math.max(0, soLine.acceptedCum - soLine.alreadyBilled);
    const payableQty = Math.min(billedQty, available);
    const payableRate = Math.min(billedRate, soLine.soRate);
    const gstFactor = 1 + soLine.gstPercent / 100;
    return {
      payableQty,
      payableRate,
      amount: payableQty * payableRate * gstFactor,
      qtyCapped: payableQty < billedQty,
      rateCapped: billedRate > soLine.soRate,
      available,
    };
  }

  const computedPayable = so
    ? so.lines.reduce((sum, l) => sum + (preview(l.soItemId)?.amount ?? 0), 0)
    : 0;
  const deductionsTotal = deductions.reduce(
    (sum, d) => sum + (Number(d.amount) || 0),
    0,
  );
  const netPayable = computedPayable - deductionsTotal;

  function handleSave() {
    if (!so) return;
    if (!vendorBillNumber.trim() || !vendorBillDate) {
      return void toast.error("Vendor bill number and date are required.");
    }
    for (const d of deductions) {
      if (!d.type || !(Number(d.amount) > 0)) {
        return void toast.error("Every deduction needs a type and an amount.");
      }
      if ((d.type === "LD_PENALTY" || d.type === "OTHER") && !d.remarks.trim()) {
        return void toast.error("Remarks are mandatory for LD / Penalty and Other deductions.");
      }
    }
    startTransition(async () => {
      const result = await saveBill({
        id: initial?.id,
        soId: so.soId,
        vendorBillNumber,
        vendorBillDate,
        lines: so.lines
          .map((l) => line(l.soItemId))
          .filter((l) => Number(l.billedQty) > 0)
          .map((l) => ({
            soItemId: l.soItemId,
            billedQty: Number(l.billedQty),
            billedRate: Number(l.billedRate) || 0,
          })),
        deductions: deductions.map((d) => ({
          type: d.type as DeductionType,
          amount: Number(d.amount),
          remarks: d.remarks.trim() || undefined,
        })),
      });
      if (result.ok) {
        toast.success("Bill saved — three-way match computed");
        router.push(`/bills/${result.data!.id}`);
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
                <Label htmlFor="bill-so-number">SO number</Label>
                <Input
                  id="bill-so-number"
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
                {so.soNumber} · {so.vendorName} · GRNs: {so.grnNumbers.join(", ")}{" "}
                · Bill {so.priorBillCount + 1} against this SO
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {so && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendor bill</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="bill-no">Vendor bill number</Label>
                <Input
                  id="bill-no"
                  value={vendorBillNumber}
                  onChange={(e) => setVendorBillNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bill-date">Bill date</Label>
                <Input
                  id="bill-date"
                  type="date"
                  value={vendorBillDate}
                  onChange={(e) => setVendorBillDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Lines — three-way match{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (payable figures are computed; nothing here accepts a typed
                  payable amount)
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
                      <TableHead className="text-right">Accepted</TableHead>
                      <TableHead className="text-right">Already billed</TableHead>
                      <TableHead className="text-right">SO rate</TableHead>
                      <TableHead className="w-24 text-right">Billed qty</TableHead>
                      <TableHead className="w-28 text-right">Billed rate</TableHead>
                      <TableHead className="text-right">Payable (incl. GST)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {so.lines.map((soLine) => {
                      const l = line(soLine.soItemId);
                      const p = preview(soLine.soItemId);
                      return (
                        <TableRow key={soLine.soItemId}>
                          <TableCell className="font-medium">
                            {soLine.description}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {soLine.unit} · GST {soLine.gstPercent}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {soLine.ordered}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {soLine.acceptedCum}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {soLine.alreadyBilled}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {inr.format(soLine.soRate)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className={cn("h-8 text-right", p?.qtyCapped && "border-warning bg-warning/10")}
                              value={l.billedQty}
                              onChange={(e) =>
                                updateLine(soLine.soItemId, { billedQty: e.target.value })
                              }
                              aria-label={`Billed qty ${soLine.description}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className={cn("h-8 text-right", p?.rateCapped && "border-warning bg-warning/10")}
                              value={l.billedRate}
                              onChange={(e) =>
                                updateLine(soLine.soItemId, { billedRate: e.target.value })
                              }
                              aria-label={`Billed rate ${soLine.description}`}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {p ? inr.format(p.amount) : "—"}
                            {p?.qtyCapped && (
                              <span className="block text-xs font-normal text-warning">
                                Billed {Number(l.billedQty)}, accepted {p.available},{" "}
                                {p.payableQty} payable
                              </span>
                            )}
                            {p?.rateCapped && (
                              <span className="block text-xs font-normal text-warning">
                                Billed ₹{Number(l.billedRate)} vs SO rate ₹{soLine.soRate} —
                                computed at ₹{soLine.soRate}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Deductions{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (manual entry only — the system never computes deduction
                  amounts)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deductions.map((d) => (
                <div key={d.key} className="grid items-end gap-3 md:grid-cols-12">
                  <div className="space-y-1.5 md:col-span-3">
                    <Label>Type</Label>
                    <Select
                      value={d.type}
                      onValueChange={(v) =>
                        setDeductions((prev) =>
                          prev.map((x) =>
                            x.key === d.key ? { ...x, type: v as DeductionType } : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEDUCTION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Amount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="text-right"
                      value={d.amount}
                      onChange={(e) =>
                        setDeductions((prev) =>
                          prev.map((x) =>
                            x.key === d.key ? { ...x, amount: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-6">
                    <Label>
                      Remarks
                      {(d.type === "LD_PENALTY" || d.type === "OTHER") && (
                        <span className="text-critical"> (required)</span>
                      )}
                    </Label>
                    <Input
                      value={d.remarks}
                      onChange={(e) =>
                        setDeductions((prev) =>
                          prev.map((x) =>
                            x.key === d.key ? { ...x, remarks: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex justify-end md:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove deduction"
                      onClick={() =>
                        setDeductions((prev) => prev.filter((x) => x.key !== d.key))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDeductions((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), type: "", amount: "", remarks: "" },
                  ])
                }
              >
                <Plus /> Add deduction
              </Button>
            </CardContent>
          </Card>

          {/* Summary — display only */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-muted p-4">
            <div className="flex flex-wrap gap-8 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Computed payable</p>
                <p className="font-semibold tabular-nums">{inr.format(computedPayable)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deductions</p>
                <p className="font-semibold tabular-nums text-critical">
                  − {inr.format(deductionsTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net payable</p>
                <p className="text-lg font-semibold tabular-nums text-primary">
                  {inr.format(netPayable)}
                </p>
              </div>
            </div>
            <Button disabled={isPending} onClick={handleSave}>
              {isPending ? "Saving…" : initial ? "Save changes" : "Save bill"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
