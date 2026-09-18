"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { recordPayment } from "../../payments/actions";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function BillPaymentsCard({
  billId,
  netPayable,
  paidSoFar,
  canPay,
  payments,
}: {
  billId: string;
  netPayable: number;
  paidSoFar: number;
  canPay: boolean;
  payments: {
    id: string;
    voucherNumber: string;
    voucherDate: string;
    amountPaid: number;
    mode: string | null;
    remarks: string | null;
    enteredBy: string;
  }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const balance = netPayable - paidSoFar;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await recordPayment({
        billId,
        voucherNumber: String(fd.get("voucherNumber") ?? ""),
        voucherDate: String(fd.get("voucherDate") ?? ""),
        amountPaid: Number(fd.get("amountPaid") ?? 0),
        mode: String(fd.get("mode") ?? ""),
        remarks: String(fd.get("remarks") ?? ""),
      });
      if (result.ok) {
        toast.success(
          result.data!.status === "PAID"
            ? "Payment recorded — bill fully PAID"
            : "Part payment recorded",
        );
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">
          Payments{" "}
          <span className="text-xs font-normal text-muted-foreground">
            paid {inr.format(paidSoFar)} of {inr.format(netPayable)} · balance{" "}
            {inr.format(balance)}
          </span>
        </CardTitle>
        {canPay && balance > 0 && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Record payment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Entered by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.voucherNumber}</TableCell>
                    <TableCell className="text-sm">{p.voucherDate}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {inr.format(p.amountPaid)}
                    </TableCell>
                    <TableCell className="text-sm">{p.mode ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.remarks ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.enteredBy}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Payment happens offline on the physical file — this records the
              outcome. Balance: {inr.format(balance)}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pay-voucher">Voucher number</Label>
                <Input id="pay-voucher" name="voucherNumber" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Voucher date</Label>
                <Input id="pay-date" name="voucherDate" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount paid (₹)</Label>
                <Input
                  id="pay-amount"
                  name="amountPaid"
                  type="number"
                  min={0.01}
                  step="any"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-mode">Mode</Label>
                <Input id="pay-mode" name="mode" placeholder="e.g. Treasury / NEFT / Cheque" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pay-remarks">Remarks</Label>
                <Input id="pay-remarks" name="remarks" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
