-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" UUID;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

