import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SectionsUsersClient } from "./sections-users-client";

export const metadata: Metadata = { title: "Sections & Users" };

export default async function SectionsUsersPage() {
  const user = await requirePageAccess("/sections-users");

  const [sections, profiles] = await Promise.all([
    prisma.section.findMany({ orderBy: { name: "asc" } }),
    prisma.profile.findMany({
      include: { section: true, admSections: { include: { section: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Emails live in Supabase Auth, not in Profile.
  const admin = createSupabaseAdminClient();
  const { data: authList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (
    <>
      <PageHeader
        title="Sections & Users"
        breadcrumb={[
          { label: "Home", href: "/" },
          { label: "Sections & Users" },
        ]}
      />
      <SectionsUsersClient
        currentUserId={user.id}
        sections={sections.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          active: s.active,
        }))}
        users={profiles.map((p) => ({
          id: p.id,
          email: emailById.get(p.id) ?? "—",
          name: p.name,
          designation: p.designation,
          role: p.role,
          sectionId: p.sectionId,
          sectionName: p.section.name,
          active: p.active,
          admSectionIds: p.admSections.map((m) => m.sectionId),
          admSectionCodes: p.admSections.map((m) => m.section.code),
        }))}
      />
    </>
  );
}
