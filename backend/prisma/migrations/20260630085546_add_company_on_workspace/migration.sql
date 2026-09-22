-- CreateTable
CREATE TABLE "CompanyOnWorkspace" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyOnWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyOnWorkspace_workspaceId_idx" ON "CompanyOnWorkspace"("workspaceId");

-- CreateIndex
CREATE INDEX "CompanyOnWorkspace_companyId_idx" ON "CompanyOnWorkspace"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyOnWorkspace_workspaceId_companyId_key" ON "CompanyOnWorkspace"("workspaceId", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyOnWorkspace" ADD CONSTRAINT "CompanyOnWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyOnWorkspace" ADD CONSTRAINT "CompanyOnWorkspace_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
