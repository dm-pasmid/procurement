import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/authz";
import { requirePageAccess } from "@/lib/page-guard";
import { BillForm } from "../bill-form";

export const metadata: Metadata = { title: "New bill" };

export default async function NewBillPage() {
  const user = await requirePageAccess("/bills");
  if (!can(user, "create", "bill")) redirect("/bills");

  return (
    <>
      <PageHeader
        title="New bill"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Bills", href: "/bills" },
          { label: "New" },
        ]}
      />
      <BillForm />
    </>
  );
}
