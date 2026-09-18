import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface SearchHit {
  label: string;
  sublabel: string;
  href: string;
  group: string;
}

const sectionScoped = (role: string) => role === "OC" || role === "INITIATOR";

/**
 * Global lookup by document number, vendor, item or section — jumps straight
 * to the record. Respects section scoping for OC / Initiator.
 */
export async function globalSearch(
  user: Pick<CurrentUser, "role" | "sectionId">,
  raw: string,
): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const scoped = sectionScoped(user.role);
  const hits: SearchHit[] = [];

  const [reqs, sos, grns, bills, vendors, items, sections] = await Promise.all([
    prisma.requisition.findMany({
      where: {
        reqNumber: { contains: q, mode: "insensitive" },
        ...(scoped ? { sectionId: user.sectionId } : {}),
      },
      include: { section: true },
      take: 5,
    }),
    prisma.supplyOrder.findMany({
      where: {
        soNumber: { contains: q, mode: "insensitive" },
        ...(scoped ? { requisition: { sectionId: user.sectionId } } : {}),
      },
      include: { vendor: true },
      take: 5,
    }),
    prisma.grn.findMany({
      where: {
        grnNumber: { contains: q, mode: "insensitive" },
        ...(scoped ? { so: { deliverySectionId: user.sectionId } } : {}),
      },
      take: 5,
    }),
    prisma.bill.findMany({
      where: {
        bpmNumber: { contains: q, mode: "insensitive" },
        ...(scoped ? { so: { requisition: { sectionId: user.sectionId } } } : {}),
      },
      take: 5,
    }),
    // Vendors / items / sections are masters — visible to all authenticated roles.
    prisma.vendor.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 5,
    }),
    prisma.item.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 5,
    }),
    prisma.section.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 5,
    }),
  ]);

  for (const r of reqs) {
    hits.push({
      group: "Requisitions",
      label: r.reqNumber.startsWith("DRAFT-") ? "(draft requisition)" : r.reqNumber,
      sublabel: `${r.section.name} · ${r.status.replaceAll("_", " ").toLowerCase()}`,
      href: `/requisitions/${r.id}`,
    });
  }
  for (const so of sos) {
    hits.push({
      group: "Supply Orders",
      label: so.soNumber,
      sublabel: so.vendor.name,
      href: `/supply-orders/${so.id}`,
    });
  }
  for (const g of grns) {
    hits.push({ group: "GRNs", label: g.grnNumber, sublabel: "Goods receipt note", href: `/grn/${g.id}` });
  }
  for (const b of bills) {
    hits.push({
      group: "Bills",
      label: b.bpmNumber.startsWith("DRAFT-") ? "(bill, memo pending)" : b.bpmNumber,
      sublabel: `Vendor bill ${b.vendorBillNumber}`,
      href: `/bills/${b.id}`,
    });
  }
  const canSeeVendors = !scoped;
  for (const v of vendors) {
    hits.push({
      group: "Vendors",
      label: v.name,
      sublabel: v.gstin ?? "Vendor",
      href: canSeeVendors ? `/vendors` : `/vendors`,
    });
  }
  for (const it of items) {
    hits.push({ group: "Items", label: it.name, sublabel: `${it.category} · ${it.unit}`, href: `/items` });
  }
  for (const s of sections) {
    hits.push({ group: "Sections", label: s.name, sublabel: s.code, href: `/registers?register=section-expenditure` });
  }

  return hits;
}
