import "server-only";
import { prisma } from "@/lib/prisma";
import type { MasterItem } from "./requisition-form";

/** Active master items serialised for the client-side picker. */
export async function loadMasterItems(): Promise<MasterItem[]> {
  const items = await prisma.item.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    specTemplate: i.specTemplate,
    lastPurchaseRate: i.lastPurchaseRate?.toFixed(2) ?? null,
    lastPurchaseDate: i.lastPurchaseDate?.toISOString() ?? null,
    avgRate12m: i.avgRate12m?.toFixed(2) ?? null,
  }));
}

export async function loadAdmLimit(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "ADM_LIMIT" },
  });
  return setting ? Number(setting.value) : 20000;
}
