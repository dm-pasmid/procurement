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
import { VendorEmpanelmentBadge } from "@/components/vendor-empanelment-badge";
import { saveVendor, setVendorActive } from "./actions";

export interface VendorRow {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  bankAccountNo: string | null;
  ifsc: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  empanelled: boolean;
  empanelmentRef: string | null;
  empanelmentValidTill: string | null; // yyyy-mm-dd
  active: boolean;
}

export function VendorsClient({
  vendors,
  readOnly,
}: {
  vendors: VendorRow[];
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empanelled, setEmpanelled] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setEmpanelled(false);
    setDialogOpen(true);
  }

  function openEdit(vendor: VendorRow) {
    setEditing(vendor);
    setEmpanelled(vendor.empanelled);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    startTransition(async () => {
      const result = await saveVendor({
        id: editing?.id,
        name: text("name"),
        gstin: text("gstin"),
        pan: text("pan"),
        bankAccountNo: text("bankAccountNo"),
        ifsc: text("ifsc"),
        address: text("address"),
        phone: text("phone"),
        email: text("email"),
        empanelled,
        empanelmentRef: text("empanelmentRef"),
        empanelmentValidTill: text("empanelmentValidTill"),
      });
      if (result.ok) {
        toast.success(editing ? "Vendor updated" : "Vendor created");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive(vendor: VendorRow, active: boolean) {
    startTransition(async () => {
      const result = await setVendorActive(vendor.id, active);
      if (result.ok) {
        toast.success(active ? "Vendor activated" : "Vendor deactivated");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {!readOnly && (
        <div className="mb-3 flex justify-end">
          <Button onClick={openCreate}>
            <Plus /> New vendor
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Empanelment</TableHead>
              <TableHead>Status</TableHead>
              {!readOnly && <TableHead className="w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={readOnly ? 5 : 6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No vendors yet.
                </TableCell>
              </TableRow>
            )}
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">{vendor.name}</TableCell>
                <TableCell>{vendor.gstin ?? "—"}</TableCell>
                <TableCell>{vendor.phone ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    <VendorEmpanelmentBadge
                      empanelled={vendor.empanelled}
                      validTill={vendor.empanelmentValidTill}
                    />
                    {vendor.empanelled && (
                      <span className="text-xs text-muted-foreground">
                        {vendor.empanelmentRef}
                        {vendor.empanelmentValidTill
                          ? ` · till ${vendor.empanelmentValidTill}`
                          : ""}
                      </span>
                    )}
                    {!vendor.empanelled && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {vendor.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${vendor.name}`}
                        onClick={() => openEdit(vendor)}
                      >
                        <Pencil />
                      </Button>
                      <Switch
                        checked={vendor.active}
                        disabled={isPending}
                        onCheckedChange={(v) => toggleActive(vendor, v)}
                        aria-label={`${vendor.active ? "Deactivate" : "Activate"} ${vendor.name}`}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit vendor" : "New vendor"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the vendor master record."
                : "Add a vendor to the master list."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="v-name">Name</Label>
              <Input
                id="v-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="v-gstin">GSTIN</Label>
                <Input
                  id="v-gstin"
                  name="gstin"
                  defaultValue={editing?.gstin ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-pan">PAN</Label>
                <Input id="v-pan" name="pan" defaultValue={editing?.pan ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-bank">Bank account no.</Label>
                <Input
                  id="v-bank"
                  name="bankAccountNo"
                  defaultValue={editing?.bankAccountNo ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-ifsc">IFSC</Label>
                <Input
                  id="v-ifsc"
                  name="ifsc"
                  defaultValue={editing?.ifsc ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-phone">Phone</Label>
                <Input
                  id="v-phone"
                  name="phone"
                  defaultValue={editing?.phone ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-email">Email</Label>
                <Input
                  id="v-email"
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-address">Address</Label>
              <Textarea
                id="v-address"
                name="address"
                rows={2}
                defaultValue={editing?.address ?? ""}
              />
            </div>

            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="v-empanelled">Empanelled</Label>
                <Switch
                  id="v-empanelled"
                  checked={empanelled}
                  onCheckedChange={setEmpanelled}
                />
              </div>
              {empanelled && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-emp-ref">Empanelment ref.</Label>
                    <Input
                      id="v-emp-ref"
                      name="empanelmentRef"
                      defaultValue={editing?.empanelmentRef ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-emp-till">Valid till</Label>
                    <Input
                      id="v-emp-till"
                      name="empanelmentValidTill"
                      type="date"
                      defaultValue={editing?.empanelmentValidTill ?? ""}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

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
