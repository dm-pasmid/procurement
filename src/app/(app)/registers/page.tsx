import type { Metadata } from "next";
import Link from "next/link";
import {
  BillStatus,
  FlagSeverity,
  FlagType,
  GrnStatus,
  ReqStatus,
  SoStatus,
} from "@prisma/client";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { REQ_STATUS_LABELS } from "@/components/req-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FLAG_TYPE_LABELS } from "@/lib/flag-utils";
import { deriveFy } from "@/lib/numbering";
import { requirePageAccess } from "@/lib/page-guard";
import {
  availableFys,
  loadRegister,
  registerMeta,
  registersForRole,
  type RegisterKey,
} from "@/lib/registers";
import { cn } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Registers" };

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 });

function humanize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replaceAll("_", " ");
}

export default async function RegistersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePageAccess("/registers");
  const params = await searchParams;

  const available = registersForRole(user.role);
  const activeKey = (params.register as RegisterKey) ?? available[0]?.key;
  const meta = registerMeta(activeKey);
  const allowed = available.some((r) => r.key === activeKey);
  if (!meta || !allowed) {
    // Fall back to the first register the role may see.
    const fallback = available[0];
    return (
      <>
        <PageHeader title="Registers" breadcrumb={[{ label: "Home", href: "/" }, { label: "Registers" }]} />
        {fallback && (
          <p className="text-sm">
            <Link href={`/registers?register=${fallback.key}`} className="text-primary underline">
              Open {fallback.title}
            </Link>
          </p>
        )}
      </>
    );
  }

  const fys = await availableFys(
    user.role === "OC" || user.role === "INITIATOR" ? user.sectionId : undefined,
  );
  const fy = params.fy && fys.includes(params.fy) ? params.fy : fys[0] ?? deriveFy();

  const data = await loadRegister(activeKey, {
    role: user.role,
    sectionId: user.sectionId,
    fy,
    filters: {
      status: params.status,
      type: params.type,
      severity: params.severity,
    },
  });

  // Export links carry the active FY + filters.
  const qs = new URLSearchParams({ register: activeKey, fy });
  if (params.status) qs.set("status", params.status);
  if (params.type) qs.set("type", params.type);
  if (params.severity) qs.set("severity", params.severity);

  // Filter options per register.
  const statusOptions =
    activeKey === "requisition"
      ? Object.keys(ReqStatus).map((v) => ({ value: v, label: REQ_STATUS_LABELS[v as ReqStatus] }))
      : activeKey === "supply-order"
        ? Object.keys(SoStatus).map((v) => ({ value: v, label: humanize(v) }))
        : activeKey === "grn"
          ? Object.keys(GrnStatus).map((v) => ({ value: v, label: humanize(v) }))
          : activeKey === "bill"
            ? Object.keys(BillStatus).map((v) => ({ value: v, label: humanize(v) }))
            : null;

  return (
    <>
      <PageHeader
        title="Registers"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Registers" }]}
        action={
          <div className="flex gap-2 print:hidden">
            <Button asChild variant="outline" size="sm">
              <a href={`/registers/export?${qs.toString()}&format=xlsx`}>
                <FileSpreadsheet /> Excel
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/registers/export?${qs.toString()}&format=pdf`} target="_blank" rel="noreferrer">
                <FileDown /> PDF
              </a>
            </Button>
            <PrintButton />
          </div>
        }
      />

      {/* Register selector */}
      <div className="mb-4 flex flex-wrap gap-1.5 print:hidden">
        {available.map((r) => (
          <Button
            key={r.key}
            asChild
            variant={r.key === activeKey ? "default" : "outline"}
            size="sm"
          >
            <Link href={`/registers?register=${r.key}&fy=${fy}`}>{r.title}</Link>
          </Button>
        ))}
      </div>

      {/* FY + filters */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/50 p-3 print:hidden">
        <input type="hidden" name="register" value={activeKey} />
        <div className="space-y-1">
          <label htmlFor="f-fy" className="text-xs font-medium">Financial year</label>
          <select id="f-fy" name="fy" defaultValue={fy} className="border-input bg-background h-8 w-28 rounded-md border px-2 text-sm">
            {fys.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        {statusOptions && (
          <div className="space-y-1">
            <label htmlFor="f-status" className="text-xs font-medium">Status</label>
            <select id="f-status" name="status" defaultValue={params.status ?? ""} className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm">
              <option value="">All</option>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        {activeKey === "deviation" && (
          <>
            <div className="space-y-1">
              <label htmlFor="f-type" className="text-xs font-medium">Type</label>
              <select id="f-type" name="type" defaultValue={params.type ?? ""} className="border-input bg-background h-8 w-48 rounded-md border px-2 text-sm">
                <option value="">All</option>
                {Object.keys(FlagType).map((v) => (
                  <option key={v} value={v}>{FLAG_TYPE_LABELS[v as FlagType]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="f-severity" className="text-xs font-medium">Severity</label>
              <select id="f-severity" name="severity" defaultValue={params.severity ?? ""} className="border-input bg-background h-8 w-32 rounded-md border px-2 text-sm">
                <option value="">All</option>
                {Object.keys(FlagSeverity).map((v) => (
                  <option key={v} value={v}>{humanize(v)}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <Button type="submit" variant="outline" size="sm">Apply</Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/registers?register=${activeKey}`}>Clear</Link>
        </Button>
      </form>

      {/* Print header (visible only when printing) */}
      <div className="mb-3 hidden text-center print:block">
        <p className="text-sm font-semibold text-primary">
          Office of the District Magistrate &amp; Collector, Paschim Medinipur
        </p>
        <p className="text-sm font-medium">{data.title} — FY {data.fy}</p>
        <p className="text-xs text-muted-foreground">
          Generated {new Date().toLocaleString("en-IN")}
          {data.sectionScoped ? " · section-scoped view" : ""}
        </p>
      </div>

      <p className="mb-2 text-sm text-muted-foreground print:hidden">
        {data.title} · FY {fy} · {data.rows.length} record{data.rows.length === 1 ? "" : "s"}
        {data.sectionScoped ? " · your section only" : ""}
      </p>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {data.columns.map((c) => (
                <TableHead key={c.key} className={cn("whitespace-nowrap", c.numeric && "text-right")}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={data.columns.length} className="py-8 text-center text-muted-foreground">
                  No records for this register.
                </TableCell>
              </TableRow>
            )}
            {data.rows.map((row, i) => (
              <TableRow key={i}>
                {data.columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.numeric && "text-right tabular-nums")}>
                    {c.numeric && typeof row[c.key] === "number"
                      ? nf.format(row[c.key] as number)
                      : String(row[c.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
