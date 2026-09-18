"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  countersignGrn,
  getGrnAttachmentUrl,
  reopenGrn,
  uploadGrnAttachment,
} from "../actions";

export function GrnDetailActions({
  grnId,
  status,
  isOcOfSection,
  canEdit,
  declaration,
  attachments,
}: {
  grnId: string;
  status: string;
  isOcOfSection: boolean;
  canEdit: boolean;
  declaration: string;
  attachments: { id: string; label: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [signOpen, setSignOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCountersign() {
    if (!declared) {
      return void toast.error("Confirm the declaration to countersign.");
    }
    startTransition(async () => {
      const result = await countersignGrn({ grnId, declarationAccepted: true });
      if (result.ok) {
        toast.success(`Countersigned as ${result.data!.grnNumber}`);
        setSignOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleReopen() {
    if (reason.trim().length < 10) {
      return void toast.error("Give a reopen reason (min 10 characters).");
    }
    startTransition(async () => {
      const result = await reopenGrn({ grnId, reason: reason.trim() });
      if (result.ok) {
        toast.success("GRN reopened for correction — re-countersign after editing");
        setReopenOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("grnId", grnId);
    startTransition(async () => {
      const result = await uploadGrnAttachment(fd);
      if (result.ok) {
        toast.success("Challan attachment uploaded");
        form.reset();
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function openAttachment(id: string) {
    startTransition(async () => {
      const result = await getGrnAttachmentUrl(id);
      if (result.ok) window.open(result.data!.url, "_blank");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Attachments */}
      <div className="rounded-md border p-4">
        <p className="mb-2 text-sm font-semibold text-primary">
          Challan attachment{" "}
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </p>
        {attachments.length > 0 && (
          <ul className="mb-3 space-y-1">
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => openAttachment(a.id)}
                  className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline"
                >
                  <FileText className="size-4" />
                  {a.label}
                  <span className="text-xs text-muted-foreground">{a.createdAt}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="grn-att-label">Label</Label>
              <Input
                id="grn-att-label"
                name="label"
                placeholder="Challan copy"
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grn-att-file">File (photo / scan)</Label>
              <Input id="grn-att-file" name="file" type="file" accept="image/*,.pdf" required />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>
              <Paperclip /> Upload
            </Button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {status === "DRAFT" && isOcOfSection && (
          <Button disabled={isPending} onClick={() => setSignOpen(true)}>
            Countersign
          </Button>
        )}
        {status === "COUNTERSIGNED" && isOcOfSection && (
          <Button variant="outline" disabled={isPending} onClick={() => setReopenOpen(true)}>
            Reopen for correction
          </Button>
        )}
      </div>

      {/* Countersign declaration */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OC countersignature</DialogTitle>
            <DialogDescription>
              Countersigning allocates the GRN number and makes this receipt
              count for billing.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <Checkbox
              checked={declared}
              onCheckedChange={(v) => setDeclared(v === true)}
              className="mt-0.5"
              aria-label="Declaration"
            />
            <span className="font-medium">{declaration}</span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isPending || !declared} onClick={handleCountersign}>
              {isPending ? "Working…" : "Countersign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen GRN for correction</DialogTitle>
            <DialogDescription>
              Reversal GRNs with negative quantities are not allowed. Reopening
              returns this GRN to draft for correction and re-countersignature.
              The reason is audit-logged and shown on the GRN for ever.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="grn-reopen-reason">Reason</Label>
            <Textarea
              id="grn-reopen-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleReopen}>
              {isPending ? "Working…" : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
