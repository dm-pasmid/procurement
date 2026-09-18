"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateMemo,
  getBillAttachmentUrl,
  uploadBillAttachment,
} from "../actions";

export function BillDetailActions({
  billId,
  status,
  isNdc,
  canEdit,
  attachments,
}: {
  billId: string;
  status: string;
  isNdc: boolean;
  canEdit: boolean;
  attachments: { id: string; label: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateMemo(billId);
      if (result.ok) {
        toast.success(`Bill Passing Memo ${result.data!.bpmNumber} generated`);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("billId", billId);
    startTransition(async () => {
      const result = await uploadBillAttachment(fd);
      if (result.ok) {
        toast.success("Attachment uploaded");
        form.reset();
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function openAttachment(id: string) {
    startTransition(async () => {
      const result = await getBillAttachmentUrl(id);
      if (result.ok) window.open(result.data!.url, "_blank");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <p className="mb-2 text-sm font-semibold text-primary">
          Scanned vendor bill
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
              <Label htmlFor="bill-att-label">Label</Label>
              <Input
                id="bill-att-label"
                name="label"
                placeholder="Vendor bill (scan)"
                className="w-48"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-att-file">File</Label>
              <Input id="bill-att-file" name="file" type="file" accept="image/*,.pdf" required />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>
              <Paperclip /> Upload
            </Button>
          </form>
        )}
      </div>

      {status === "ENTERED" && isNdc && (
        <div className="flex justify-end">
          <Button disabled={isPending} onClick={handleGenerate}>
            {isPending ? "Working…" : "Generate Bill Passing Memo"}
          </Button>
        </div>
      )}
    </div>
  );
}
