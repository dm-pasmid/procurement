-- RequisitionItem: either a catalogued item or a free-text name is required.
ALTER TABLE "RequisitionItem"
  ADD CONSTRAINT "RequisitionItem_item_or_free_name_check"
  CHECK ("itemId" IS NOT NULL OR "itemNameFree" IS NOT NULL);

-- Append-only enforcement: AuditLog and ApprovalAction rows can never be
-- modified or deleted, regardless of the connecting role's table privileges.
CREATE OR REPLACE FUNCTION prevent_row_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();

CREATE TRIGGER approval_action_append_only
  BEFORE UPDATE OR DELETE ON "ApprovalAction"
  FOR EACH ROW EXECUTE FUNCTION prevent_row_mutation();
