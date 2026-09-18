import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

const DESCRIPTIONS: Record<string, string> = {
  ADM_LIMIT:
    "Sanction limit (₹). Requisitions estimated above this route to the DM.",
  EST_TOLERANCE_PCT:
    "Tolerance (%) allowed between estimate and procured amount before flagging.",
  SPLIT_WINDOW_DAYS:
    "Window (days) for detecting split purchases from the same section.",
  PRICE_DEV_PCT:
    "Deviation (%) from last purchase / average rate that raises a price flag.",
  FREQ_COUNT:
    "Number of purchases of the same item that counts as frequent.",
  FREQ_WINDOW_DAYS: "Window (days) for the purchase-frequency check.",
  APPROVAL_SLA_HOURS:
    "Hours an approval may sit pending before an SLA flag is raised.",
  PROC_IDLE_DAYS:
    "Days an approved requisition may sit unprocessed in the procurement queue.",
  GRN_NO_BILL_DAYS:
    "Days after goods receipt without a bill before flagging.",
  BILL_UNPAID_DAYS: "Days a bill may remain unpaid before flagging.",
  QTY_MULTIPLIER:
    "Multiple of historical quantity that raises a quantity-anomaly flag.",
  SO_TERMS_TEMPLATE:
    "Standard terms seeded into every new supply order (payment, delivery, penalty clause).",
};

export default async function SettingsPage() {
  await requirePageAccess("/settings");

  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });

  return (
    <>
      <PageHeader
        title="Settings"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Settings" }]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Workflow thresholds. Every change is audit-logged.
      </p>
      <SettingsClient
        settings={settings.map((s) => ({
          key: s.key,
          value: s.value,
          description: DESCRIPTIONS[s.key] ?? "—",
        }))}
      />
    </>
  );
}
