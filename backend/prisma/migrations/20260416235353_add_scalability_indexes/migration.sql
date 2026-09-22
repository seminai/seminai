-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");

-- CreateIndex
CREATE INDEX "Job_productionUnitId_idx" ON "Job"("productionUnitId");

-- CreateIndex
CREATE INDEX "Job_productionCycleId_idx" ON "Job"("productionCycleId");

-- CreateIndex
CREATE INDEX "Job_machineId_idx" ON "Job"("machineId");

-- CreateIndex
CREATE INDEX "Job_dateOfOpeation_idx" ON "Job"("dateOfOpeation");

-- CreateIndex
CREATE INDEX "Patentino_userId_idx" ON "Patentino"("userId");

-- CreateIndex
CREATE INDEX "Product_warehouseId_idx" ON "Product"("warehouseId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Stock_productId_idx" ON "Stock"("productId");

-- CreateIndex
CREATE INDEX "Stock_jobId_idx" ON "Stock"("jobId");

-- CreateIndex
CREATE INDEX "UserOnCompany_companyId_idx" ON "UserOnCompany"("companyId");

-- CreateIndex
CREATE INDEX "UserOnCompany_userId_idx" ON "UserOnCompany"("userId");
