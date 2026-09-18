-- CreateTable
CREATE TABLE "AdmSection" (
    "id" TEXT NOT NULL,
    "admId" UUID NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "AdmSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmSection_sectionId_idx" ON "AdmSection"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmSection_admId_sectionId_key" ON "AdmSection"("admId", "sectionId");

-- AddForeignKey
ALTER TABLE "AdmSection" ADD CONSTRAINT "AdmSection_admId_fkey" FOREIGN KEY ("admId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmSection" ADD CONSTRAINT "AdmSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS: readable to all authenticated (like Profile); writes go through the
-- app (table owner) — no client-side write policy.
ALTER TABLE "AdmSection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm_section_select" ON "AdmSection"
  FOR SELECT TO authenticated USING (true);
