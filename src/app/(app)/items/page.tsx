import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { ItemsClient } from "./items-client";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage() {
  await requirePageAccess("/items");

  const items = await prisma.item.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Items"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Items" }]}
      />
      <ItemsClient
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          unit: i.unit,
          specTemplate: i.specTemplate,
          lastPurchaseRate: i.lastPurchaseRate?.toFixed(2) ?? null,
          avgRate12m: i.avgRate12m?.toFixed(2) ?? null,
          active: i.active,
        }))}
      />
    </>
  );
}
