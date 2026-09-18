-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('INITIATOR', 'OC', 'ADM', 'DM', 'NDC', 'NEZARATH_CLERK', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReqStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'OC_APPROVED', 'ADM_APPROVED', 'APPROVED', 'RETURNED', 'REJECTED', 'IN_PROCUREMENT', 'SO_ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BILL_UNDER_PROCESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinalLevel" AS ENUM ('ADM', 'DM');

-- CreateEnum
CREATE TYPE "EstBasis" AS ENUM ('LAST_PURCHASE_RATE', 'MARKET_SURVEY', 'GEM', 'RATE_CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('OC', 'ADM', 'DM');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVE', 'RETURN', 'REJECT');

-- CreateEnum
CREATE TYPE "ProcMode" AS ENUM ('TENDER', 'EMPANELLED', 'GEM');

-- CreateEnum
CREATE TYPE "SoStatus" AS ENUM ('DRAFT', 'ISSUED', 'AMENDED', 'CANCELLED', 'CLOSED', 'SHORT_CLOSED');

-- CreateEnum
CREATE TYPE "GrnStatus" AS ENUM ('DRAFT', 'COUNTERSIGNED');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('ENTERED', 'MEMO_GENERATED', 'PART_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('SECURITY_DEPOSIT', 'LD_PENALTY', 'TDS_IT', 'TDS_GST', 'OTHER');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('SPLITTING_SUSPECT', 'PRICE_DEVIATION', 'QTY_ANOMALY', 'FREQUENCY_ANOMALY', 'DUPLICATE_SUSPECT', 'ESTIMATE_EXCEEDED', 'DELIVERY_OVERDUE', 'APPROVAL_SLA', 'GRN_NO_BILL', 'BILL_UNPAID');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('REQ', 'SO', 'GRN', 'BPM');

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "sectionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "specTemplate" TEXT,
    "lastPurchaseRate" DECIMAL(14,2),
    "lastPurchaseDate" TIMESTAMP(3),
    "avgRate12m" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "bankAccountNo" TEXT,
    "ifsc" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "empanelled" BOOLEAN NOT NULL DEFAULT false,
    "empanelmentRef" TEXT,
    "empanelmentValidTill" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "reqNumber" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "initiatorId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "ReqStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedTotal" DECIMAL(14,2) NOT NULL,
    "sanctionedTotal" DECIMAL(14,2),
    "finalLevel" "FinalLevel" NOT NULL,
    "routedToDmReason" TEXT,
    "desiredDeliveryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionItem" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemNameFree" TEXT,
    "specification" TEXT,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "estRate" DECIMAL(14,2) NOT NULL,
    "estBasis" "EstBasis" NOT NULL,
    "basisRemarks" TEXT,

    CONSTRAINT "RequisitionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Procurement" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "mode" "ProcMode" NOT NULL,
    "nitNumber" TEXT,
    "nitDate" TIMESTAMP(3),
    "bidsReceived" INTEGER,
    "gemOrderRef" TEXT,
    "vendorId" TEXT NOT NULL,
    "procuredAmount" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Procurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" TEXT NOT NULL,
    "soNumber" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "deliverySectionId" TEXT NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "status" "SoStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentSoId" TEXT,
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3),
    "shortCloseReason" TEXT,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderItem" (
    "id" TEXT NOT NULL,
    "soId" TEXT NOT NULL,
    "reqItemId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "SupplyOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grn" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "soId" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "challanDate" TIMESTAMP(3) NOT NULL,
    "receiverId" UUID NOT NULL,
    "ocCountersignedById" UUID,
    "ocCountersignedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "status" "GrnStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Grn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrnItem" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "soItemId" TEXT NOT NULL,
    "qtyReceived" DECIMAL(12,3) NOT NULL,
    "qtyAccepted" DECIMAL(12,3) NOT NULL,
    "qtyRejected" DECIMAL(12,3) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "GrnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "bpmNumber" TEXT NOT NULL,
    "soId" TEXT NOT NULL,
    "vendorBillNumber" TEXT NOT NULL,
    "vendorBillDate" TIMESTAMP(3) NOT NULL,
    "claimedAmount" DECIMAL(14,2) NOT NULL,
    "computedPayable" DECIMAL(14,2) NOT NULL,
    "deductionsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'ENTERED',
    "enteredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "soItemId" TEXT NOT NULL,
    "billedQty" DECIMAL(12,3) NOT NULL,
    "billedRate" DECIMAL(14,2) NOT NULL,
    "payableQty" DECIMAL(12,3) NOT NULL,
    "payableRate" DECIMAL(14,2) NOT NULL,
    "lineDeviations" JSONB NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillDeduction" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "type" "DeductionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,

    CONSTRAINT "BillDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "voucherDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL,
    "mode" TEXT,
    "remarks" TEXT,
    "enteredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "flagType" "FlagType" NOT NULL,
    "severity" "FlagSeverity" NOT NULL,
    "details" JSONB NOT NULL,
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgeRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSeries" (
    "id" SERIAL NOT NULL,
    "fy" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "lastSerial" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code");

-- CreateIndex
CREATE INDEX "Profile_sectionId_idx" ON "Profile"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_name_unit_key" ON "Item"("name", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_reqNumber_key" ON "Requisition"("reqNumber");

-- CreateIndex
CREATE INDEX "Requisition_sectionId_idx" ON "Requisition"("sectionId");

-- CreateIndex
CREATE INDEX "Requisition_initiatorId_idx" ON "Requisition"("initiatorId");

-- CreateIndex
CREATE INDEX "Requisition_status_idx" ON "Requisition"("status");

-- CreateIndex
CREATE INDEX "Requisition_fy_idx" ON "Requisition"("fy");

-- CreateIndex
CREATE INDEX "RequisitionItem_requisitionId_idx" ON "RequisitionItem"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionItem_itemId_idx" ON "RequisitionItem"("itemId");

-- CreateIndex
CREATE INDEX "ApprovalAction_requisitionId_idx" ON "ApprovalAction"("requisitionId");

-- CreateIndex
CREATE INDEX "ApprovalAction_actorId_idx" ON "ApprovalAction"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Procurement_requisitionId_key" ON "Procurement"("requisitionId");

-- CreateIndex
CREATE INDEX "Procurement_vendorId_idx" ON "Procurement"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrder_soNumber_key" ON "SupplyOrder"("soNumber");

-- CreateIndex
CREATE INDEX "SupplyOrder_requisitionId_idx" ON "SupplyOrder"("requisitionId");

-- CreateIndex
CREATE INDEX "SupplyOrder_procurementId_idx" ON "SupplyOrder"("procurementId");

-- CreateIndex
CREATE INDEX "SupplyOrder_vendorId_idx" ON "SupplyOrder"("vendorId");

-- CreateIndex
CREATE INDEX "SupplyOrder_status_idx" ON "SupplyOrder"("status");

-- CreateIndex
CREATE INDEX "SupplyOrder_fy_idx" ON "SupplyOrder"("fy");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_soId_idx" ON "SupplyOrderItem"("soId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_reqItemId_idx" ON "SupplyOrderItem"("reqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Grn_grnNumber_key" ON "Grn"("grnNumber");

-- CreateIndex
CREATE INDEX "Grn_soId_idx" ON "Grn"("soId");

-- CreateIndex
CREATE INDEX "Grn_receiverId_idx" ON "Grn"("receiverId");

-- CreateIndex
CREATE INDEX "GrnItem_grnId_idx" ON "GrnItem"("grnId");

-- CreateIndex
CREATE INDEX "GrnItem_soItemId_idx" ON "GrnItem"("soItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_bpmNumber_key" ON "Bill"("bpmNumber");

-- CreateIndex
CREATE INDEX "Bill_soId_idx" ON "Bill"("soId");

-- CreateIndex
CREATE INDEX "Bill_status_idx" ON "Bill"("status");

-- CreateIndex
CREATE INDEX "BillItem_billId_idx" ON "BillItem"("billId");

-- CreateIndex
CREATE INDEX "BillItem_soItemId_idx" ON "BillItem"("soItemId");

-- CreateIndex
CREATE INDEX "BillDeduction_billId_idx" ON "BillDeduction"("billId");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Flag_entityType_entityId_idx" ON "Flag"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Flag_flagType_idx" ON "Flag"("flagType");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSeries_fy_docType_key" ON "NumberSeries"("fy", "docType");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionItem" ADD CONSTRAINT "RequisitionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_deliverySectionId_fkey" FOREIGN KEY ("deliverySectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_parentSoId_fkey" FOREIGN KEY ("parentSoId") REFERENCES "SupplyOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_soId_fkey" FOREIGN KEY ("soId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_reqItemId_fkey" FOREIGN KEY ("reqItemId") REFERENCES "RequisitionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_soId_fkey" FOREIGN KEY ("soId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grn" ADD CONSTRAINT "Grn_ocCountersignedById_fkey" FOREIGN KEY ("ocCountersignedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnItem" ADD CONSTRAINT "GrnItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "Grn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrnItem" ADD CONSTRAINT "GrnItem_soItemId_fkey" FOREIGN KEY ("soItemId") REFERENCES "SupplyOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_soId_fkey" FOREIGN KEY ("soId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_soItemId_fkey" FOREIGN KEY ("soItemId") REFERENCES "SupplyOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillDeduction" ADD CONSTRAINT "BillDeduction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

