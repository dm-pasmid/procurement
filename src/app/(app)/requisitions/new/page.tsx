import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { loadAdmLimit, loadMasterItems } from "../form-data";
import { RequisitionForm } from "../requisition-form";

export const metadata: Metadata = { title: "New requisition" };

export default async function NewRequisitionPage() {
  const user = await requirePageAccess("/requisitions");
  if (!can(user, "create", "requisition", { sectionId: user.sectionId })) {
    redirect("/requisitions");
  }

  const [items, admLimit] = await Promise.all([
    loadMasterItems(),
    loadAdmLimit(),
  ]);

  return (
    <>
      <PageHeader
        title="New requisition"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Requisitions", href: "/requisitions" },
          { label: "New" },
        ]}
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Section: <span className="font-medium text-foreground">{user.sectionName}</span>.
        A requisition cannot be submitted without a complete item-wise
        financial estimate.
      </p>
      <RequisitionForm items={items} admLimit={admLimit} />
    </>
  );
}
