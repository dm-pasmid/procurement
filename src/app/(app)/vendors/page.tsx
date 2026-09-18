import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { VendorsClient } from "./vendors-client";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const user = await requirePageAccess("/vendors");

  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Vendors"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Vendors" }]}
      />
      <VendorsClient
        readOnly={!can(user, "manage", "vendor")}
        vendors={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          gstin: v.gstin,
          pan: v.pan,
          bankAccountNo: v.bankAccountNo,
          ifsc: v.ifsc,
          address: v.address,
          phone: v.phone,
          email: v.email,
          empanelled: v.empanelled,
          empanelmentRef: v.empanelmentRef,
          empanelmentValidTill:
            v.empanelmentValidTill?.toISOString().slice(0, 10) ?? null,
          active: v.active,
        }))}
      />
    </>
  );
}
