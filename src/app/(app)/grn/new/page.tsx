import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { GrnEntryForm } from "../grn-entry-form";

export const metadata: Metadata = { title: "New GRN" };

export default async function NewGrnPage() {
  const user = await requirePageAccess("/grn");
  if (!can(user, "create", "grn", { sectionId: user.sectionId })) {
    redirect("/grn");
  }

  return (
    <>
      <PageHeader
        title="New goods receipt note"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "GRN", href: "/grn" },
          { label: "New" },
        ]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Enter or scan the supply order number. Receiving section:{" "}
        <span className="font-medium text-foreground">{user.sectionName}</span>.
      </p>
      <GrnEntryForm />
    </>
  );
}
