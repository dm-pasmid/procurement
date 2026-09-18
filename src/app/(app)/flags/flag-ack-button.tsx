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
import { acknowledgeFlag } from "./actions";

export function FlagAckButton({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAck() {
    startTransition(async () => {
      const result = await acknowledgeFlag({ flagId, remarks: remarks.trim() });
      if (result.ok) {
        toast.success("Flag acknowledged");
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Acknowledge
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge flag</DialogTitle>
            <DialogDescription>
              Your name, time and remarks are recorded on the flag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ack-remarks">Remarks</Label>
            <Textarea
              id="ack-remarks"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={isPending} onClick={handleAck}>
              {isPending ? "Working…" : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
