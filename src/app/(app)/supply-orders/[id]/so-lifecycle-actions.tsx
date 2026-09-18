"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { amendSo, cancelSo, closeCase, issueSo, shortCloseSo } from "../actions";

export function SoLifecycleActions({
  soId,
  status,
  isNdc,
  canDraft,
  hasUndeliveredBalance = false,
  canCloseCase = false,
}: {
  soId: string;
  status: string;
  isNdc: boolean;
  canDraft: boolean;
  hasUndeliveredBalance?: boolean;
  /** SO terminal + all bills PAID + requisition not yet CLOSED. */
  canCloseCase?: boolean;
}) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [shortCloseOpen, setShortCloseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [shortCloseReason, setShortCloseReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleIssue() {
    startTransition(async () => {
      const result = await issueSo(soId);
      if (result.ok) {
        toast.success(`Issued as ${result.data!.soNumber}`);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleAmend() {
    startTransition(async () => {
      const result = await amendSo(soId);
      if (result.ok) {
        toast.success("Amendment draft created");
        router.push(`/supply-orders/${result.data!.id}/edit`);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleCancel() {
    if (reason.trim().length < 10) {
      return void toast.error("Give a cancellation reason (min 10 characters).");
    }
    startTransition(async () => {
      const result = await cancelSo({ soId, reason: reason.trim() });
      if (result.ok) {
        toast.success("Supply order cancelled");
        setCancelOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleShortClose() {
    if (shortCloseReason.trim().length < 10) {
      return void toast.error("Give a short-close reason (min 10 characters).");
    }
    startTransition(async () => {
      const result = await shortCloseSo({ soId, reason: shortCloseReason.trim() });
      if (result.ok) {
        toast.success("Supply order short-closed");
        setShortCloseOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleCloseCase() {
    startTransition(async () => {
      const result = await closeCase(soId);
      if (result.ok) {
        toast.success("Case closed — requisition is now read-only");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canCloseCase && isNdc && (
        <Button disabled={isPending} onClick={handleCloseCase}>
          {isPending ? "Working…" : "Close case"}
        </Button>
      )}
      {status === "DRAFT" && isNdc && (
        <Button disabled={isPending} onClick={handleIssue}>
          {isPending ? "Working…" : "Issue supply order"}
        </Button>
      )}
      {status === "ISSUED" && isNdc && hasUndeliveredBalance && (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setShortCloseOpen(true)}
        >
          Short close
        </Button>
      )}
      {status === "ISSUED" && canDraft && (
        <Button variant="outline" disabled={isPending} onClick={handleAmend}>
          Amend
        </Button>
      )}
      {(status === "DRAFT" || status === "ISSUED") && isNdc && (
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => setCancelOpen(true)}
        >
          Cancel
        </Button>
      )}

      <Dialog open={shortCloseOpen} onOpenChange={setShortCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Short-close supply order</DialogTitle>
            <DialogDescription>
              The undelivered balance is abandoned; the requisition moves to
              RECEIVED with what has arrived. The reason is recorded for ever.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="short-close-reason">Reason</Label>
            <Textarea
              id="short-close-reason"
              rows={3}
              value={shortCloseReason}
              onChange={(e) => setShortCloseReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortCloseOpen(false)}>
              Keep order open
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleShortClose}
            >
              {isPending ? "Working…" : "Short close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel supply order</DialogTitle>
            <DialogDescription>
              The allocated number is never reused. A reason is mandatory and
              recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleCancel}
            >
              {isPending ? "Working…" : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
