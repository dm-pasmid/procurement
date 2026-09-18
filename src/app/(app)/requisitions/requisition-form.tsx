"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstBasis } from "@prisma/client";
import { AlertTriangle, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { findDuplicates, saveDraft, submitRequisition } from "./actions";

export interface MasterItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  specTemplate: string | null;
  lastPurchaseRate: string | null;
  lastPurchaseDate: string | null; // ISO
  avgRate12m: string | null;
}

export interface FormLine {
  key: string;
  itemId: string | null;
  itemNameFree: string;
  specification: string;
  unit: string;
  qty: string;
  estRate: string;
  estBasis: EstBasis | "";
  basisRemarks: string;
}

export interface RequisitionFormValues {
  id?: string;
  purpose: string;
  desiredDeliveryDays: string;
  lines: FormLine[];
}

const BASIS_OPTIONS: { value: EstBasis; label: string }[] = [
  { value: "LAST_PURCHASE_RATE", label: "Last Purchase Rate" },
  { value: "MARKET_SURVEY", label: "Market Survey" },
  { value: "GEM", label: "GeM" },
  { value: "RATE_CONTRACT", label: "Rate Contract" },
  { value: "OTHER", label: "Other" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function emptyLine(key?: string): FormLine {
  return {
    // Random keys are only safe after mount; SSR needs a deterministic one.
    key: key ?? crypto.randomUUID(),
    itemId: null,
    itemNameFree: "",
    specification: "",
    unit: "",
    qty: "",
    estRate: "",
    estBasis: "",
    basisRemarks: "",
  };
}

interface DuplicateHit {
  id: string;
  reqNumber: string;
  status: string;
  items: string[];
}

export function RequisitionForm({
  items,
  admLimit,
  initial,
}: {
  items: MasterItem[];
  admLimit: number;
  initial?: RequisitionFormValues;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [deliveryDays, setDeliveryDays] = useState(
    initial?.desiredDeliveryDays ?? "",
  );
  const [lines, setLines] = useState<FormLine[]>(
    initial?.lines.length ? initial.lines : [emptyLine("line-initial")],
  );
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [isPending, startTransition] = useTransition();
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // ---- suggestive duplicate lookup, debounced on master-item changes ----
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedItemIds = lines
    .map((l) => l.itemId)
    .filter((v): v is string => !!v)
    .sort()
    .join(",");
  useEffect(() => {
    if (dupTimer.current) clearTimeout(dupTimer.current);
    if (!selectedItemIds) {
      setDuplicates([]);
      return;
    }
    dupTimer.current = setTimeout(async () => {
      const result = await findDuplicates(
        selectedItemIds.split(","),
        initial?.id,
      );
      if (result.ok) setDuplicates(result.data ?? []);
    }, 500);
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current);
    };
  }, [selectedItemIds, initial?.id]);

  const updateLine = useCallback((key: string, patch: Partial<FormLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }, []);

  function pickMasterItem(key: string, item: MasterItem) {
    // Suggestive defaults — everything stays editable.
    updateLine(key, {
      itemId: item.id,
      itemNameFree: "",
      unit: item.unit,
      specification: item.specTemplate ?? "",
      estRate: item.lastPurchaseRate ?? "",
      estBasis: item.lastPurchaseRate ? "LAST_PURCHASE_RATE" : "",
    });
  }

  function pickFreeText(key: string, name: string) {
    updateLine(key, { itemId: null, itemNameFree: name });
  }

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.estRate) || 0),
    0,
  );
  const routesToDm = total > admLimit;

  function payload() {
    return {
      id: initial?.id,
      purpose,
      desiredDeliveryDays: deliveryDays ? Number(deliveryDays) : null,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        itemNameFree: l.itemNameFree || null,
        specification: l.specification,
        unit: l.unit,
        qty: Number(l.qty) || 0,
        estRate: Number(l.estRate) || 0,
        estBasis: l.estBasis || null,
        basisRemarks: l.basisRemarks,
      })),
    };
  }

  function clientValidateForSubmit(): string | null {
    if (purpose.trim().length < 20)
      return "Purpose / justification must be at least 20 characters.";
    if (lines.length === 0) return "Add at least one line item.";
    for (const [i, l] of lines.entries()) {
      const label = l.itemId
        ? itemById.get(l.itemId)?.name
        : l.itemNameFree || `Line ${i + 1}`;
      if (!l.itemId && !l.itemNameFree) return `Line ${i + 1}: choose an item.`;
      if (!l.unit) return `${label}: unit is required.`;
      if (!(Number(l.qty) > 0)) return `${label}: quantity must be greater than 0.`;
      if (!(Number(l.estRate) > 0)) return `${label}: estimated rate must be greater than 0.`;
      if (!l.estBasis) return `${label}: select the basis of estimate.`;
      if (l.estBasis === "OTHER" && !l.basisRemarks.trim())
        return `${label}: remarks are mandatory when basis is Other.`;
    }
    return null;
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const result = await saveDraft(payload());
      if (result.ok) {
        toast.success("Draft saved");
        router.push(`/requisitions/${result.data!.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSubmit() {
    const problem = clientValidateForSubmit();
    if (problem) {
      toast.error(problem);
      return;
    }
    startTransition(async () => {
      const result = await submitRequisition(payload());
      if (result.ok) {
        toast.success(`Submitted as ${result.data!.reqNumber}`);
        router.push(`/requisitions/${result.data!.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {/* Header */}
      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <div className="space-y-1.5">
          <Label htmlFor="purpose">Purpose / justification</Label>
          <Textarea
            id="purpose"
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Why is this procurement needed? (minimum 20 characters)"
            required
            minLength={20}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="delivery-days">Desired delivery period (days)</Label>
          <Input
            id="delivery-days"
            type="number"
            min={1}
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
          />
        </div>
      </div>

      {/* Duplicate notice — suggestive only */}
      {duplicates.length > 0 && (
        <Alert className="border-warning text-warning [&>svg]:text-warning">
          <AlertTriangle />
          <AlertTitle>Possible duplicate</AlertTitle>
          <AlertDescription className="text-foreground">
            <ul className="list-disc pl-4">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/requisitions/${d.id}`}
                    target="_blank"
                    className="underline underline-offset-2"
                  >
                    {d.reqNumber.startsWith("DRAFT-") ? "Draft" : d.reqNumber}
                  </a>{" "}
                  for {d.items.join(", ")} is already{" "}
                  {d.status.replaceAll("_", " ").toLowerCase()}. You may still
                  submit; the overlap will be flagged for review.
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Line items</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus /> Add line
          </Button>
        </div>

        {lines.map((line, index) => {
          const master = line.itemId ? itemById.get(line.itemId) : undefined;
          return (
            <div key={line.key} className="rounded-md border p-3">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-4">
                  <Label>Item</Label>
                  <ItemCombobox
                    items={items}
                    selected={master ?? null}
                    freeText={line.itemNameFree}
                    onPickItem={(item) => pickMasterItem(line.key, item)}
                    onPickFree={(name) => pickFreeText(line.key, name)}
                  />
                  {master?.lastPurchaseRate && (
                    <p className="text-xs text-muted-foreground">
                      LPR ₹{master.lastPurchaseRate}
                      {master.lastPurchaseDate
                        ? ` on ${new Date(master.lastPurchaseDate).toLocaleDateString("en-IN")}`
                        : ""}
                      {master.avgRate12m
                        ? ` · 12-month avg ₹${master.avgRate12m}`
                        : ""}
                    </p>
                  )}
                  {!line.itemId && line.itemNameFree && (
                    <Badge className="bg-warning text-warning-foreground">
                      non-master item
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <Label htmlFor={`spec-${line.key}`}>Specification</Label>
                  <Input
                    id={`spec-${line.key}`}
                    value={line.specification}
                    onChange={(e) =>
                      updateLine(line.key, { specification: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <Label htmlFor={`unit-${line.key}`}>Unit</Label>
                  <Input
                    id={`unit-${line.key}`}
                    value={line.unit}
                    onChange={(e) =>
                      updateLine(line.key, { unit: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <Label htmlFor={`qty-${line.key}`}>Qty</Label>
                  <Input
                    id={`qty-${line.key}`}
                    type="number"
                    min={0}
                    step="any"
                    value={line.qty}
                    onChange={(e) =>
                      updateLine(line.key, { qty: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`rate-${line.key}`}>Est. rate (₹)</Label>
                  <Input
                    id={`rate-${line.key}`}
                    type="number"
                    min={0}
                    step="any"
                    value={line.estRate}
                    onChange={(e) =>
                      updateLine(line.key, { estRate: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-end justify-end md:col-span-1">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-medium tabular-nums">
                      {inr.format(
                        (Number(line.qty) || 0) * (Number(line.estRate) || 0),
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid items-end gap-3 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-3">
                  <Label>Basis of estimate</Label>
                  <Select
                    value={line.estBasis}
                    onValueChange={(v) =>
                      updateLine(line.key, { estBasis: v as EstBasis })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select basis" />
                    </SelectTrigger>
                    <SelectContent>
                      {BASIS_OPTIONS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-8">
                  <Label htmlFor={`remarks-${line.key}`}>
                    Basis remarks
                    {line.estBasis === "OTHER" && (
                      <span className="text-critical"> (required)</span>
                    )}
                  </Label>
                  <Input
                    id={`remarks-${line.key}`}
                    value={line.basisRemarks}
                    onChange={(e) =>
                      updateLine(line.key, { basisRemarks: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end md:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((prev) => prev.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total + routing */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-4">
        <div>
          <p className="text-xs text-muted-foreground">Total estimate</p>
          <p className="text-xl font-semibold tabular-nums text-primary">
            {inr.format(total)}
          </p>
        </div>
        <p className={cn("text-sm font-medium", routesToDm ? "text-warning" : "text-muted-foreground")}>
          {routesToDm
            ? `> ₹${admLimit.toLocaleString("en-IN")} — final approval: DM`
            : `≤ ₹${admLimit.toLocaleString("en-IN")} — final approval: ADM`}
        </p>
      </div>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={handleSaveDraft}
        >
          Save as draft
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Working…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Item combobox with free-text fallback
// ---------------------------------------------------------------------------

function ItemCombobox({
  items,
  selected,
  freeText,
  onPickItem,
  onPickFree,
}: {
  items: MasterItem[];
  selected: MasterItem | null;
  freeText: string;
  onPickItem: (item: MasterItem) => void;
  onPickFree: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const label = selected?.name ?? (freeText || "Select item…");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && !freeText && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search item master…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No matching master item.</CommandEmpty>
            <CommandGroup heading="Item master">
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.category}`}
                  onSelect={() => {
                    onPickItem(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      selected?.id === item.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.unit}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {query.trim() && (
              <CommandGroup heading="Not in master">
                <CommandItem
                  value={`__free__${query}`}
                  onSelect={() => {
                    onPickFree(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="size-4" />
                  Use “{query.trim()}” as non-master item
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
