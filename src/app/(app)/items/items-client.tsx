"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { saveItem, setItemActive } from "./actions";

export interface ItemRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  specTemplate: string | null;
  lastPurchaseRate: string | null;
  avgRate12m: string | null;
  active: boolean;
}

export function ItemsClient({ items }: { items: ItemRow[] }) {
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(item: ItemRow) {
    setEditing(item);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveItem({
        id: editing?.id,
        name: String(form.get("name") ?? ""),
        category: String(form.get("category") ?? ""),
        unit: String(form.get("unit") ?? ""),
        specTemplate: String(form.get("specTemplate") ?? ""),
      });
      if (result.ok) {
        toast.success(editing ? "Item updated" : "Item created");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive(item: ItemRow, active: boolean) {
    startTransition(async () => {
      const result = await setItemActive(item.id, active);
      if (result.ok) {
        toast.success(active ? "Item activated" : "Item deactivated");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={openCreate}>
          <Plus /> New item
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Last purchase rate</TableHead>
              <TableHead className="text-right">Avg rate (12m)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No items yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.lastPurchaseRate ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.avgRate12m ?? "—"}
                </TableCell>
                <TableCell>
                  {item.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil />
                    </Button>
                    <Switch
                      checked={item.active}
                      disabled={isPending}
                      onCheckedChange={(v) => toggleActive(item, v)}
                      aria-label={`${item.active ? "Deactivate" : "Activate"} ${item.name}`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "New item"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the item master record."
                : "Add an item to the master list."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="item-category">Category</Label>
                <Input
                  id="item-category"
                  name="category"
                  defaultValue={editing?.category ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-unit">Unit</Label>
                <Input
                  id="item-unit"
                  name="unit"
                  defaultValue={editing?.unit ?? ""}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-spec">Specification template</Label>
              <Textarea
                id="item-spec"
                name="specTemplate"
                rows={3}
                defaultValue={editing?.specTemplate ?? ""}
              />
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground">
                Last purchase rate and 12-month average rate are maintained
                automatically and cannot be edited.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
