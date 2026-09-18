"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { soTotal } from "@/lib/so-utils";
import { cn } from "@/lib/utils";
import { saveSoDraft } from "./actions";

export interface SoFormLine {
  key: string;
  reqItemId: string | null;
  description: string;
  unit: string;
  qty: string;
  rate: string;
  gstPercent: string;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function SoForm({
  soId,
  requisitionId,
  sanction,
  tolerancePct,
  sections,
  initialDeliverySectionId,
  initialDeliveryDays,
  deliverySuggested,
  initialTerms,
  initialLines,
}: {
  soId?: string;
  requisitionId: string;
  sanction: number;
  tolerancePct: number;
  sections: { id: string; name: string }[];
  initialDeliverySectionId: string;
  initialDeliveryDays: string;
  /** True when the delivery period comes from vendor history. */
  deliverySuggested: boolean;
  initialTerms: string;
  initialLines: SoFormLine[];
}) {
  const router = useRouter();
  const [deliverySectionId, setDeliverySectionId] = useState(initialDeliverySectionId);
  const [deliveryDays, setDeliveryDays] = useState(initialDeliveryDays);
  const [terms, setTerms] = useState(initialTerms);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();

  const total = soTotal(
    lines.map((l) => ({
      qty: Number(l.qty) || 0,
      rate: Number(l.rate) || 0,
      gstPercent: Number(l.gstPercent) || 0,
    })),
  );
  const ceiling = sanction * (1 + tolerancePct / 100);
  const beyond = total > ceiling;

  function update(key: string, patch: Partial<SoFormLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function handleSave() {
    for (const line of lines) {
      if (!(Number(line.qty) > 0) || !(Number(line.rate) > 0)) {
        return void toast.error(`${line.description}: quantity and rate must be greater than 0.`);
      }
    }
    if (!deliveryDays || !(Number(deliveryDays) > 0)) {
      return void toast.error("Enter the delivery period.");
    }
    startTransition(async () => {
      const result = await saveSoDraft({
        id: soId,
        requisitionId,
        deliverySectionId,
        deliveryDays: Number(deliveryDays),
        terms,
        lines: lines.map((l) => ({
          reqItemId: l.reqItemId,
          description: l.description,
          unit: l.unit,
          qty: Number(l.qty),
          rate: Number(l.rate),
          gstPercent: Number(l.gstPercent) || 0,
        })),
      });
      if (result.ok) {
        toast.success("Supply order draft saved");
        router.push(`/supply-orders/${result.data!.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-32 text-right">Rate (₹)</TableHead>
                  <TableHead className="w-24 text-right">GST %</TableHead>
                  <TableHead className="w-32 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.key}>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => update(line.key, { description: e.target.value })}
                        aria-label="Line description"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.unit}
                        onChange={(e) => update(line.key, { unit: e.target.value })}
                        aria-label="Unit"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="text-right"
                        value={line.qty}
                        onChange={(e) => update(line.key, { qty: e.target.value })}
                        aria-label="Quantity"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="text-right"
                        value={line.rate}
                        onChange={(e) => update(line.key, { rate: e.target.value })}
                        aria-label="Rate"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        className="text-right"
                        value={line.gstPercent}
                        onChange={(e) => update(line.key, { gstPercent: e.target.value })}
                        aria-label="GST percent"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {inr.format(
                        (Number(line.qty) || 0) *
                          (Number(line.rate) || 0) *
                          (1 + (Number(line.gstPercent) || 0) / 100),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-medium">
                    Total (incl. GST)
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular-nums",
                      beyond ? "text-critical" : "text-primary",
                    )}
                  >
                    {inr.format(total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className={cn("mt-2 text-xs", beyond ? "font-medium text-critical" : "text-muted-foreground")}>
            {beyond
              ? `Exceeds sanction ${inr.format(sanction)} beyond the ${tolerancePct}% tolerance (ceiling ${inr.format(ceiling)}) — saving is blocked.`
              : `Sanction ${inr.format(sanction)} · tolerance ceiling ${inr.format(ceiling)} (${tolerancePct}%).`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery & terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Delivery location (section)</Label>
              <Select value={deliverySectionId} onValueChange={setDeliverySectionId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="so-delivery-days">Delivery period (days)</Label>
              <Input
                id="so-delivery-days"
                type="number"
                min={1}
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
              />
              {deliverySuggested && deliveryDays === initialDeliveryDays && (
                <p className="text-xs text-muted-foreground">
                  suggested from vendor history
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="so-terms">Terms & conditions</Label>
            <Textarea
              id="so-terms"
              rows={7}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Seeded from the SO_TERMS_TEMPLATE setting — edit as needed.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button disabled={isPending || beyond} onClick={handleSave}>
          {isPending ? "Saving…" : soId ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </div>
  );
}
