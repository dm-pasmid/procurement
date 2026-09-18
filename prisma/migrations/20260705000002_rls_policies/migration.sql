-- Row Level Security mirroring the application role matrix.
-- The app itself connects as the table owner (postgres) and is governed by
-- can() in src/lib/authz.ts; these policies govern direct PostgREST /
-- supabase-js access with the anon or authenticated keys.

-- Helper functions read the caller's Profile. SECURITY DEFINER lets them run
-- inside policies without recursing into Profile's own RLS.
CREATE OR REPLACE FUNCTION public.pms_role() RETURNS "Role"
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM "Profile" WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.pms_section() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "sectionId" FROM "Profile" WHERE id = auth.uid() AND active
$$;

-- Enable RLS everywhere (NumberSeries gets no policies: API access denied).
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Requisition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RequisitionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Procurement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplyOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupplyOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Grn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillDeduction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Flag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NumberSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Profiles: readable to all authenticated; writable by ADMIN.
-- ---------------------------------------------------------------------------
CREATE POLICY "profile_select" ON "Profile"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profile_admin_insert" ON "Profile"
  FOR INSERT TO authenticated WITH CHECK (public.pms_role() = 'ADMIN');
CREATE POLICY "profile_admin_update" ON "Profile"
  FOR UPDATE TO authenticated USING (public.pms_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- Masters: readable to all authenticated; writable by ADMIN. No deletes.
-- ---------------------------------------------------------------------------
CREATE POLICY "section_select" ON "Section"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "section_admin_insert" ON "Section"
  FOR INSERT TO authenticated WITH CHECK (public.pms_role() = 'ADMIN');
CREATE POLICY "section_admin_update" ON "Section"
  FOR UPDATE TO authenticated USING (public.pms_role() = 'ADMIN');

CREATE POLICY "item_select" ON "Item"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_admin_insert" ON "Item"
  FOR INSERT TO authenticated WITH CHECK (public.pms_role() = 'ADMIN');
CREATE POLICY "item_admin_update" ON "Item"
  FOR UPDATE TO authenticated USING (public.pms_role() = 'ADMIN');

CREATE POLICY "vendor_select" ON "Vendor"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_admin_insert" ON "Vendor"
  FOR INSERT TO authenticated WITH CHECK (public.pms_role() = 'ADMIN');
CREATE POLICY "vendor_admin_update" ON "Vendor"
  FOR UPDATE TO authenticated USING (public.pms_role() = 'ADMIN');

CREATE POLICY "setting_select" ON "Setting"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "setting_admin_update" ON "Setting"
  FOR UPDATE TO authenticated USING (public.pms_role() = 'ADMIN');

-- ---------------------------------------------------------------------------
-- Requisitions: full read for ADM/DM/NDC/ADMIN; section-scoped for
-- INITIATOR/OC, who also create and update within their section.
-- ---------------------------------------------------------------------------
CREATE POLICY "requisition_select" ON "Requisition"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN')
    OR (public.pms_role() IN ('INITIATOR', 'OC')
        AND "sectionId" = public.pms_section())
  );
CREATE POLICY "requisition_insert" ON "Requisition"
  FOR INSERT TO authenticated WITH CHECK (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND "sectionId" = public.pms_section()
  );
CREATE POLICY "requisition_update" ON "Requisition"
  FOR UPDATE TO authenticated USING (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND "sectionId" = public.pms_section()
  );

CREATE POLICY "requisition_item_select" ON "RequisitionItem"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Requisition" r WHERE r.id = "requisitionId")
  );
CREATE POLICY "requisition_item_write" ON "RequisitionItem"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND EXISTS (
      SELECT 1 FROM "Requisition" r
      WHERE r.id = "requisitionId" AND r."sectionId" = public.pms_section()
    )
  );

-- ---------------------------------------------------------------------------
-- Approval actions: visible with the parent requisition; insert-only for
-- approver roles (append-only trigger blocks update/delete).
-- ---------------------------------------------------------------------------
CREATE POLICY "approval_action_select" ON "ApprovalAction"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Requisition" r WHERE r.id = "requisitionId")
  );
CREATE POLICY "approval_action_insert" ON "ApprovalAction"
  FOR INSERT TO authenticated WITH CHECK (
    public.pms_role() IN ('OC', 'ADM', 'DM') AND "actorId" = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Procurement: NDC writes; ADM/DM/NDC/ADMIN read.
-- ---------------------------------------------------------------------------
CREATE POLICY "procurement_select" ON "Procurement"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN')
  );
CREATE POLICY "procurement_write" ON "Procurement"
  FOR ALL TO authenticated USING (public.pms_role() = 'NDC')
  WITH CHECK (public.pms_role() = 'NDC');

-- ---------------------------------------------------------------------------
-- Supply orders: NEZARATH_CLERK drafts, NDC manages; ADM/DM/ADMIN read;
-- INITIATOR/OC read those belonging to their section's requisitions.
-- ---------------------------------------------------------------------------
CREATE POLICY "supply_order_select" ON "SupplyOrder"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN', 'NEZARATH_CLERK')
    OR (public.pms_role() IN ('INITIATOR', 'OC')
        AND EXISTS (
          SELECT 1 FROM "Requisition" r
          WHERE r.id = "requisitionId"
            AND r."sectionId" = public.pms_section()
        ))
  );
CREATE POLICY "supply_order_write" ON "SupplyOrder"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('NEZARATH_CLERK', 'NDC')
  ) WITH CHECK (public.pms_role() IN ('NEZARATH_CLERK', 'NDC'));

CREATE POLICY "supply_order_item_select" ON "SupplyOrderItem"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "SupplyOrder" s WHERE s.id = "soId")
  );
CREATE POLICY "supply_order_item_write" ON "SupplyOrderItem"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('NEZARATH_CLERK', 'NDC')
  ) WITH CHECK (public.pms_role() IN ('NEZARATH_CLERK', 'NDC'));

-- ---------------------------------------------------------------------------
-- GRN: receiving sections (INITIATOR/OC) write within their section;
-- ADM/DM/NDC/ADMIN read.
-- ---------------------------------------------------------------------------
CREATE POLICY "grn_select" ON "Grn"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN')
    OR (public.pms_role() IN ('INITIATOR', 'OC')
        AND EXISTS (
          SELECT 1 FROM "SupplyOrder" s
          JOIN "Requisition" r ON r.id = s."requisitionId"
          WHERE s.id = "soId" AND r."sectionId" = public.pms_section()
        ))
  );
CREATE POLICY "grn_write" ON "Grn"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND EXISTS (
      SELECT 1 FROM "SupplyOrder" s
      JOIN "Requisition" r ON r.id = s."requisitionId"
      WHERE s.id = "soId" AND r."sectionId" = public.pms_section()
    )
  ) WITH CHECK (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND EXISTS (
      SELECT 1 FROM "SupplyOrder" s
      JOIN "Requisition" r ON r.id = s."requisitionId"
      WHERE s.id = "soId" AND r."sectionId" = public.pms_section()
    )
  );

CREATE POLICY "grn_item_select" ON "GrnItem"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Grn" g WHERE g.id = "grnId")
  );
CREATE POLICY "grn_item_write" ON "GrnItem"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND EXISTS (SELECT 1 FROM "Grn" g WHERE g.id = "grnId")
  ) WITH CHECK (
    public.pms_role() IN ('INITIATOR', 'OC')
    AND EXISTS (SELECT 1 FROM "Grn" g WHERE g.id = "grnId")
  );

-- ---------------------------------------------------------------------------
-- Bills & payments: NEZARATH_CLERK enters, NDC processes;
-- ADM/DM/ADMIN read.
-- ---------------------------------------------------------------------------
CREATE POLICY "bill_select" ON "Bill"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN', 'NEZARATH_CLERK')
  );
CREATE POLICY "bill_insert" ON "Bill"
  FOR INSERT TO authenticated WITH CHECK (
    public.pms_role() = 'NEZARATH_CLERK'
  );
CREATE POLICY "bill_update" ON "Bill"
  FOR UPDATE TO authenticated USING (
    public.pms_role() IN ('NEZARATH_CLERK', 'NDC')
  );

CREATE POLICY "bill_item_select" ON "BillItem"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Bill" b WHERE b.id = "billId")
  );
CREATE POLICY "bill_item_write" ON "BillItem"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('NEZARATH_CLERK', 'NDC')
  ) WITH CHECK (public.pms_role() IN ('NEZARATH_CLERK', 'NDC'));

CREATE POLICY "bill_deduction_select" ON "BillDeduction"
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "Bill" b WHERE b.id = "billId")
  );
CREATE POLICY "bill_deduction_write" ON "BillDeduction"
  FOR ALL TO authenticated USING (
    public.pms_role() IN ('NEZARATH_CLERK', 'NDC')
  ) WITH CHECK (public.pms_role() IN ('NEZARATH_CLERK', 'NDC'));

CREATE POLICY "payment_select" ON "Payment"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN', 'NEZARATH_CLERK')
  );
CREATE POLICY "payment_insert" ON "Payment"
  FOR INSERT TO authenticated WITH CHECK (
    public.pms_role() = 'NEZARATH_CLERK'
  );

-- ---------------------------------------------------------------------------
-- Cross-cutting
-- ---------------------------------------------------------------------------
CREATE POLICY "attachment_select" ON "Attachment"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachment_insert" ON "Attachment"
  FOR INSERT TO authenticated WITH CHECK ("uploadedById" = auth.uid());

CREATE POLICY "flag_select" ON "Flag"
  FOR SELECT TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM', 'NDC', 'ADMIN')
  );
CREATE POLICY "flag_acknowledge" ON "Flag"
  FOR UPDATE TO authenticated USING (
    public.pms_role() IN ('ADM', 'DM')
  );

-- Audit log: readable by ADMIN only; rows written by the application.
-- Append-only trigger from the previous migration blocks update/delete.
CREATE POLICY "audit_log_select" ON "AuditLog"
  FOR SELECT TO authenticated USING (public.pms_role() = 'ADMIN');
