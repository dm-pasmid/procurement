"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProcMode } from "@prisma/client";
import { AlertTriangle, FileText, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import type { VendorScore } from "@/lib/vendorScore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addVendorInline,
  confirmProcurement,
  getAttachmentUrl,
  requestRevisedSanction,
  saveProcurementDraft,
  uploadProcurementAttachment,
} from "../actions";

export interface VendorOption {
  id: string;
  name: string;
  gstin: string | null;
  empanelled: boolean;
  empanelmentRef: string | null;
  empanelmentValidTill: string | null; // ISO
  score: VendorScore;
}

export interface ProcurementFormValues {
  mode: ProcMode;
  nitNumber: string;
  nitDate: string;
  bidsReceived: string;
  gemOrderRef: string;
  vendorId: string;
  procuredAmount: string;
  remarks: string;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function ProcurementForm({
  requisitionId,
  sanction,
  tolerancePct,
  canEdit,
  isNdc,
  confirmed,
  vendors: initialVendors,
  initial,
  attachments,
}: {
  requisitionId: string;
  sanction: number;
  tolerancePct: number;
  canEdit: boolean;
  isNdc: boolean;
  confirmed: boolean;
  vendors: VendorOption[];
  initial: ProcurementFormValues | null;
  attachments: { id: string; label: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initialVendors);
  const [mode, setMode] = useState<ProcMode | "">(initial?.mode ?? "");
  const [vendorId, setVendorId] = useState(initial?.vendorId ?? "");
  const [nitNumber, setNitNumber] = useState(initial?.nitNumber ?? "");
  const [nitDate, setNitDate] = useState(initial?.nitDate ?? "");
  const [bidsReceived, setBidsReceived] = useState(initial?.bidsReceived ?? "");
  const [gemOrderRef, setGemOrderRef] = useState(initial?.gemOrderRef ?? "");
  const [amount, setAmount] = useState(initial?.procuredAmount ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [expiredAck, setExpiredAck] = useState(false);
  const [justification, setJustification] = useState("");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const vendor = vendors.find((v) => v.id === vendorId) ?? null;
  const vendorExpired =
    !!vendor?.empanelled &&
    !!vendor.empanelmentValidTill &&
    new Date(vendor.empanelmentValidTill).getTime() < Date.now();

  const pickableVendors = useMemo(() => {
    if (mode === "EMPANELLED") {
      return vendors.filter((v) => v.empanelled);
    }
    return vendors;
  }, [vendors, mode]);

  const procured = Number(amount) || 0;
  const ceiling = sanction * (1 + tolerancePct / 100);
  const overSanction = procured > sanction;
  const beyondTolerance = procured > ceiling;
  const overPct = sanction > 0 ? ((procured - sanction) / sanction) * 100 : 0;

  function payload() {
    return {
      requisitionId,
      mode,
      nitNumber,
      nitDate,
      bidsReceived: bidsReceived ? Number(bidsReceived) : null,
      gemOrderRef,
      vendorId,
      procuredAmount: procured,
      remarks,
      expiredEmpanelmentAck: expiredAck,
    };
  }

  function validate(): string | null {
    if (!mode) return "Select the procurement mode.";
    if (!vendorId) return "Select the vendor.";
    if (!(procured > 0)) return "Enter the procured amount.";
    if (mode === "TENDER" && (!nitNumber || !nitDate))
      return "NIT number and date are required for TENDER.";
    if (mode === "GEM" && !gemOrderRef)
      return "GeM order reference is required.";
    if (mode === "EMPANELLED" && vendorExpired && !expiredAck)
      return "Tick the expired-empanelment acknowledgement to proceed.";
    return null;
  }

  function handleSaveDraft() {
    const problem = validate();
    if (problem) return void toast.error(problem);
    startTransition(async () => {
      const result = await saveProcurementDraft(payload());
      if (result.ok) {
        toast.success("Outcome saved as draft");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleConfirm() {
    const problem = validate();
    if (problem) return void toast.error(problem);
    startTransition(async () => {
      const result = await confirmProcurement(payload());
      if (!result.ok) return void toast.error(result.error);
      if (result.data?.blocked) {
        setBlockedMessage(result.data.message ?? "Beyond tolerance.");
        toast.error("Beyond tolerance — send for revised approval.");
        return;
      }
      toast.success("Procurement confirmed — requisition is now IN PROCUREMENT");
      router.push("/procurement-queue");
      router.refresh();
    });
  }

  function handleRevisedSanction() {
    if (justification.trim().length < 20) {
      return void toast.error("Give a justification (min 20 characters).");
    }
    startTransition(async () => {
      // Persist latest numbers first so the request carries them.
      const saved = await saveProcurementDraft(payload());
      if (!saved.ok) return void toast.error(saved.error);
      const result = await requestRevisedSanction({
        requisitionId,
        justification: justification.trim(),
      });
      if (result.ok) {
        toast.success("Sent for revised sanction approval");
        router.push("/procurement-queue");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("requisitionId", requisitionId);
    startTransition(async () => {
      const result = await uploadProcurementAttachment(fd);
      if (result.ok) {
        toast.success("Attachment uploaded");
        form.reset();
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function openAttachment(id: string) {
    startTransition(async () => {
      const result = await getAttachmentUrl(id);
      if (result.ok) window.open(result.data!.url, "_blank");
      else toast.error(result.error);
    });
  }

  const readOnly = !canEdit || confirmed;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {/* Tolerance block banner */}
        {(blockedMessage || (beyondTolerance && !readOnly)) && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border-2 border-critical bg-critical/10 p-4"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-critical" />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-critical">
                {blockedMessage ??
                  `Procured amount ${inr.format(procured)} exceeds sanction ${inr.format(sanction)} by ${overPct.toFixed(1)}% (> ${tolerancePct}%). Send for revised approval.`}
              </p>
              {isNdc && (
                <div className="space-y-2">
                  <Label htmlFor="revision-justification">
                    Justification for revised sanction
                  </Label>
                  <Textarea
                    id="revision-justification"
                    rows={2}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Why the procured amount is higher (market conditions, L1 outcome, etc.)"
                  />
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={handleRevisedSanction}
                  >
                    Send for revised approval
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Within tolerance but above sanction — suggestive */}
        {overSanction && !beyondTolerance && !readOnly && (
          <div className="flex items-start gap-3 rounded-md border border-warning bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-sm">
              Procured {inr.format(procured)} is {overPct.toFixed(1)}% above
              sanction {inr.format(sanction)} — within the {tolerancePct}%
              tolerance. This will be flagged for visibility; confirmation is
              not blocked.
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Procurement outcome
              {confirmed && (
                <Badge className="ml-2" variant="secondary">
                  Confirmed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as ProcMode)}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TENDER">Tender</SelectItem>
                    <SelectItem value="EMPANELLED">Empanelled vendor</SelectItem>
                    <SelectItem value="GEM">GeM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "TENDER" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="nit-number">NIT number</Label>
                    <Input
                      id="nit-number"
                      value={nitNumber}
                      onChange={(e) => setNitNumber(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nit-date">NIT date</Label>
                    <Input
                      id="nit-date"
                      type="date"
                      value={nitDate}
                      onChange={(e) => setNitDate(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bids">Bids received (optional)</Label>
                    <Input
                      id="bids"
                      type="number"
                      min={0}
                      value={bidsReceived}
                      onChange={(e) => setBidsReceived(e.target.value)}
                      disabled={readOnly}
                    />
                  </div>
                </>
              )}

              {mode === "GEM" && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="gem-ref">GeM order reference</Label>
                  <Input
                    id="gem-ref"
                    value={gemOrderRef}
                    onChange={(e) => setGemOrderRef(e.target.value)}
                    disabled={readOnly}
                  />
                </div>
              )}
            </div>

            {mode && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>
                      {mode === "TENDER" ? "L1 vendor" : "Vendor"}
                    </Label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setVendorDialogOpen(true)}
                      >
                        <Plus /> Add vendor
                      </Button>
                    )}
                  </div>
                  <Select
                    value={vendorId}
                    onValueChange={(v) => {
                      setVendorId(v);
                      setExpiredAck(false);
                    }}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickableVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.empanelled ? " (empanelled)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mode === "EMPANELLED" && vendor && (
                    <p className="text-xs text-muted-foreground">
                      Empanelment ref:{" "}
                      <span className="font-medium">
                        {vendor.empanelmentRef ?? "—"}
                      </span>
                      {vendor.empanelmentValidTill &&
                        ` · valid till ${new Date(vendor.empanelmentValidTill).toLocaleDateString("en-IN")}`}
                    </p>
                  )}
                  {vendorExpired && !readOnly && (
                    <label className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-2 text-xs">
                      <Checkbox
                        checked={expiredAck}
                        onCheckedChange={(v) => setExpiredAck(v === true)}
                        className="mt-0.5"
                        aria-label="Acknowledge expired empanelment"
                      />
                      This vendor&apos;s empanelment has expired. I acknowledge
                      and choose to proceed.
                    </label>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">
                    {mode === "EMPANELLED" ? "Agreed amount (₹)" : "Procured amount (₹)"}
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    min={0}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={readOnly}
                    className={cn(
                      beyondTolerance && "border-critical bg-critical/10",
                      overSanction && !beyondTolerance && "border-warning bg-warning/10",
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sanction {inr.format(sanction)} · tolerance ceiling{" "}
                    {inr.format(ceiling)} ({tolerancePct}%)
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="proc-remarks">Remarks</Label>
              <Textarea
                id="proc-remarks"
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={readOnly}
              />
            </div>

            {!readOnly && (
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={handleSaveDraft}
                >
                  Save draft
                </Button>
                {isNdc && (
                  <Button
                    disabled={isPending || beyondTolerance}
                    onClick={handleConfirm}
                    title={
                      beyondTolerance
                        ? "Beyond tolerance — send for revised approval"
                        : undefined
                    }
                  >
                    {isPending ? "Working…" : "Confirm procurement"}
                  </Button>
                )}
                {!isNdc && (
                  <p className="self-center text-xs text-muted-foreground">
                    Draft only — the NDC confirms.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Attachments{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (NIT copy, comparative statement, GeM order…)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments yet.</p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => openAttachment(a.id)}
                      className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline"
                    >
                      <FileText className="size-4" />
                      {a.label}
                      <span className="text-xs text-muted-foreground">
                        {a.createdAt}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form
                onSubmit={handleUpload}
                className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/40 p-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="att-label">Label</Label>
                  <Input
                    id="att-label"
                    name="label"
                    placeholder="e.g. NIT copy"
                    className="w-48"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="att-file">File</Label>
                  <Input id="att-file" name="file" type="file" required />
                </div>
                <Button type="submit" variant="outline" disabled={isPending}>
                  <Paperclip /> Upload
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor performance card — suggestive only */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Vendor performance</CardTitle>
        </CardHeader>
        <CardContent>
          {!vendor ? (
            <p className="text-sm text-muted-foreground">
              Pick a vendor to see their 12-month performance.
            </p>
          ) : (
            <VendorCard vendor={vendor} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Suggestive only — never blocks selection.
          </p>
        </CardContent>
      </Card>

      {/* Inline vendor dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>
              Quick entry — complete the record later in Vendors.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                const result = await addVendorInline({
                  name: String(fd.get("name") ?? ""),
                  gstin: String(fd.get("gstin") ?? ""),
                  pan: String(fd.get("pan") ?? ""),
                  bankAccountNo: String(fd.get("bankAccountNo") ?? ""),
                  ifsc: String(fd.get("ifsc") ?? ""),
                });
                if (result.ok) {
                  const v = result.data!;
                  setVendors((prev) => [
                    ...prev,
                    {
                      id: v.id,
                      name: v.name,
                      gstin: null,
                      empanelled: false,
                      empanelmentRef: null,
                      empanelmentValidTill: null,
                      score: {
                        vendorId: v.id,
                        orders12m: 0,
                        avgDelayDays: null,
                        rejectionRatePct: null,
                        grade: null,
                      },
                    },
                  ]);
                  setVendorId(v.id);
                  setVendorDialogOpen(false);
                  toast.success("Vendor added");
                } else toast.error(result.error);
              });
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="v-name">Name</Label>
                <Input id="v-name" name="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-gstin">GSTIN</Label>
                <Input id="v-gstin" name="gstin" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-pan">PAN</Label>
                <Input id="v-pan" name="pan" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-bank">Bank account no.</Label>
                <Input id="v-bank" name="bankAccountNo" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-ifsc">IFSC</Label>
                <Input id="v-ifsc" name="ifsc" />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVendorDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Add vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const GRADE_STYLES: Record<string, string> = {
  A: "bg-primary text-primary-foreground",
  B: "bg-warning text-warning-foreground",
  C: "bg-critical text-critical-foreground",
};

function VendorCard({ vendor }: { vendor: VendorOption }) {
  const s = vendor.score;
  const expired =
    vendor.empanelled &&
    vendor.empanelmentValidTill &&
    new Date(vendor.empanelmentValidTill).getTime() < Date.now();

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{vendor.name}</p>
        {s.grade ? (
          <Badge className={GRADE_STYLES[s.grade]}>Grade {s.grade}</Badge>
        ) : (
          <Badge variant="outline">No history</Badge>
        )}
      </div>
      {vendor.empanelled && (
        <Badge
          className={
            expired
              ? "bg-warning text-warning-foreground"
              : undefined
          }
          variant={expired ? undefined : "secondary"}
        >
          {expired ? "Empanelment expired" : "Empanelled"}
        </Badge>
      )}
      <dl className="space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <dt>Orders (12 months)</dt>
          <dd className="tabular-nums text-foreground">{s.orders12m}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Avg delivery delay</dt>
          <dd className="tabular-nums text-foreground">
            {s.avgDelayDays === null ? "—" : `${s.avgDelayDays} days`}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Rejection rate</dt>
          <dd className="tabular-nums text-foreground">
            {s.rejectionRatePct === null ? "—" : `${s.rejectionRatePct}%`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
