import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/page-guard";

export const metadata: Metadata = { title: "Audit Log" };

export default async function Page() {
  await requirePageAccess("/audit-log");

  return (
    <>
      <PageHeader title="Audit Log" breadcrumb={[{ label: "Home", href: "/" }, { label: "Audit Log" }]} />
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Audit Log module — to be implemented.
      </div>
    </>
  );
}
