-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BASIC', 'LABEL_MANAGER');

-- CreateEnum
CREATE TYPE "ChatCategory" AS ENUM ('DOSAGE_AGENT');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AgentResponseStatus" AS ENUM ('COMPLETED', 'REQUIRES_APPROVAL', 'ERROR');

-- CreateEnum
CREATE TYPE "LlmJobType" AS ENUM ('LABEL', 'DOSAGE');

-- CreateEnum
CREATE TYPE "DosageAgentJobState" AS ENUM ('QUEUED', 'WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'STALLED', 'DELAYED', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('FERTILIZER', 'PESTICIDE', 'SEED', 'HARVEST', 'EQUIPMENT', 'PACKAGING');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('TREATMENT', 'SEEDING', 'FERTILIZATION');

-- CreateEnum
CREATE TYPE "LabelCategory" AS ENUM ('FERTILIZER', 'FITO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT,
    "fiscalCode" TEXT,
    "companyName" TEXT,
    "vatNumber" TEXT,
    "phoneNumber" TEXT,
    "address" TEXT,
    "profilePictureUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'BASIC',
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ChatCategory" NOT NULL DEFAULT 'DOSAGE_AGENT',
    "threadId" TEXT NOT NULL,
    "modelName" TEXT,
    "temperature" DOUBLE PRECISION DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "contentBlocks" JSONB,
    "status" "AgentResponseStatus",
    "pendingToolCalls" JSONB,
    "error" TEXT,
    "cost" JSONB,
    "metadata" JSONB,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCacheEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "namespace" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentScore" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmCacheEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCitation" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fragment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageSource" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceCitationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qdcApiKey" TEXT,
    "ifarmingApiKey" TEXT,
    "language" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patentino" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Patentino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOnCompany" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT,
    "role" "CompanyRole" NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserOnCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "cuaa" TEXT,
    "ownerId" TEXT,
    "fiscalCode" TEXT NOT NULL,
    "nation" TEXT,
    "city" TEXT,
    "address" TEXT,
    "cap" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT,
    "type" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "lastPositiveRevisionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "nation" TEXT,
    "region" TEXT,
    "city" TEXT,
    "address" TEXT NOT NULL,
    "cap" TEXT,
    "sezione" TEXT NOT NULL,
    "foglio" TEXT NOT NULL,
    "particella" TEXT NOT NULL,
    "subalterno" TEXT,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "category" "ProductCategory" NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "registrationNumber" TEXT,
    "labelUrl" TEXT,
    "labelMetadata" JSONB,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitOfMeasureQuantity" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "unitOfMeasurePrice" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ddtCode" TEXT,
    "ddtDate" TIMESTAMP(3),
    "ddtUrlFile" TEXT,
    "invoiceCode" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceUrlFile" TEXT,
    "companySupplierName" TEXT,
    "addressSupplier" TEXT,
    "vatNumberSupplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coordinates" DOUBLE PRECISION[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "polygon" JSONB,
    "gisHa" DOUBLE PRECISION,
    "sauHa" DOUBLE PRECISION,
    "ph" DOUBLE PRECISION,
    "nitrogen" DOUBLE PRECISION,
    "phosphorus" DOUBLE PRECISION,
    "potassium" DOUBLE PRECISION,
    "calcium" DOUBLE PRECISION,
    "magnesium" DOUBLE PRECISION,
    "soilType" TEXT,
    "uso" TEXT,
    "qualita" TEXT,
    "superficieCatastaleMq" DOUBLE PRECISION NOT NULL,
    "sezione" TEXT NOT NULL,
    "foglio" TEXT NOT NULL,
    "particella" TEXT NOT NULL,
    "subalterno" TEXT,
    "nation" TEXT,
    "region" TEXT,
    "city" TEXT,
    "address" TEXT NOT NULL,
    "cap" TEXT,
    "variazioneMq" TEXT,
    "inizioConduzione" TIMESTAMP(3),
    "fineConduzione" TIMESTAMP(3),

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionUnitOnField" (
    "id" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "areaHaOnField" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductionUnitOnField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "areaHa" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCycle" (
    "id" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "cropType" TEXT NOT NULL,
    "variety" TEXT NOT NULL,
    "protocoll" TEXT NOT NULL,
    "protectionStructure" TEXT NOT NULL,
    "floweringDate" TIMESTAMP(3) NOT NULL,
    "harvestingDate" TIMESTAMP(3) NOT NULL,
    "occupazione" TEXT,
    "destinazioneDiUso" TEXT,
    "acquaTotalePeridoL" DOUBLE PRECISION NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "cycleIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "productionUnitId" TEXT NOT NULL,
    "productionCycleId" TEXT,
    "dateOfOpeation" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "category" "JobCategory" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitOfMeasureQuantity" TEXT NOT NULL,
    "productQuantityTreated" DOUBLE PRECISION,
    "unitOfMeasureProductQuantityTreated" TEXT,
    "modeOfApplication" TEXT,
    "avversity" TEXT,
    "giustification" TEXT,
    "treatedSurface" DOUBLE PRECISION,
    "isLocalizedTreatment" BOOLEAN,
    "userId" TEXT,
    "note" TEXT,
    "alertNotes" JSONB,
    "history" JSONB,
    "totalDistributedWaterL" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "machineId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelExtraction" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "category" "LabelCategory" NOT NULL DEFAULT 'FITO',
    "label" JSONB NOT NULL,
    "rawText" TEXT NOT NULL,
    "extractionConfidence" INTEGER NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "extractedFields" TEXT[],
    "errors" TEXT[],
    "qualityExtraction" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "jobId" TEXT,
    "jobGroupId" TEXT,
    "jobType" "LlmJobType" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL,
    "seminaiMargin" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "costClient" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DosageAgentJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "DosageAgentJobState" NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "failedReason" TEXT,
    "processedOn" TIMESTAMP(3),
    "finishedOn" TIMESTAMP(3),
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DosageAgentJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_fiscalCode_key" ON "User"("fiscalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_threadId_key" ON "Chat"("threadId");

-- CreateIndex
CREATE INDEX "Chat_userId_idx" ON "Chat"("userId");

-- CreateIndex
CREATE INDEX "Chat_category_idx" ON "Chat"("category");

-- CreateIndex
CREATE INDEX "Chat_threadId_idx" ON "Chat"("threadId");

-- CreateIndex
CREATE INDEX "Message_chatId_idx" ON "Message"("chatId");

-- CreateIndex
CREATE INDEX "Message_chatId_sequence_idx" ON "Message"("chatId", "sequence");

-- CreateIndex
CREATE INDEX "Message_role_idx" ON "Message"("role");

-- CreateIndex
CREATE INDEX "LlmCacheEntry_namespace_idx" ON "LlmCacheEntry"("namespace");

-- CreateIndex
CREATE INDEX "LlmCacheEntry_userId_idx" ON "LlmCacheEntry"("userId");

-- CreateIndex
CREATE INDEX "LlmCacheEntry_lastCheckedAt_idx" ON "LlmCacheEntry"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCacheEntry_cacheKey_userId_key" ON "LlmCacheEntry"("cacheKey", "userId");

-- CreateIndex
CREATE INDEX "SourceCitation_url_idx" ON "SourceCitation"("url");

-- CreateIndex
CREATE INDEX "MessageSource_messageId_idx" ON "MessageSource"("messageId");

-- CreateIndex
CREATE INDEX "MessageSource_sourceCitationId_idx" ON "MessageSource"("sourceCitationId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageSource_messageId_sourceCitationId_key" ON "MessageSource"("messageId", "sourceCitationId");

-- CreateIndex
CREATE UNIQUE INDEX "Patentino_code_key" ON "Patentino"("code");

-- CreateIndex
CREATE INDEX "ProductionUnitOnField_fieldId_idx" ON "ProductionUnitOnField"("fieldId");

-- CreateIndex
CREATE INDEX "ProductionUnitOnField_productionUnitId_idx" ON "ProductionUnitOnField"("productionUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionUnitOnField_productionUnitId_fieldId_key" ON "ProductionUnitOnField"("productionUnitId", "fieldId");

-- CreateIndex
CREATE INDEX "ProductionCycle_productionUnitId_seasonYear_cycleIndex_idx" ON "ProductionCycle"("productionUnitId", "seasonYear", "cycleIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionCycle_productionUnitId_seasonYear_cycleIndex_key" ON "ProductionCycle"("productionUnitId", "seasonYear", "cycleIndex");

-- CreateIndex
CREATE INDEX "LabelExtraction_productName_idx" ON "LabelExtraction"("productName");

-- CreateIndex
CREATE INDEX "LabelExtraction_registrationNumber_idx" ON "LabelExtraction"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LabelExtraction_productName_registrationNumber_key" ON "LabelExtraction"("productName", "registrationNumber");

-- CreateIndex
CREATE INDEX "LlmUsage_userId_idx" ON "LlmUsage"("userId");

-- CreateIndex
CREATE INDEX "LlmUsage_jobId_idx" ON "LlmUsage"("jobId");

-- CreateIndex
CREATE INDEX "LlmUsage_jobGroupId_idx" ON "LlmUsage"("jobGroupId");

-- CreateIndex
CREATE INDEX "DosageAgentJob_userId_createdAt_idx" ON "DosageAgentJob"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSource" ADD CONSTRAINT "MessageSource_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageSource" ADD CONSTRAINT "MessageSource_sourceCitationId_fkey" FOREIGN KEY ("sourceCitationId") REFERENCES "SourceCitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patentino" ADD CONSTRAINT "Patentino_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOnCompany" ADD CONSTRAINT "UserOnCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOnCompany" ADD CONSTRAINT "UserOnCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionUnitOnField" ADD CONSTRAINT "ProductionUnitOnField_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionUnitOnField" ADD CONSTRAINT "ProductionUnitOnField_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCycle" ADD CONSTRAINT "ProductionCycle_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProductionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProductionUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_productionCycleId_fkey" FOREIGN KEY ("productionCycleId") REFERENCES "ProductionCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DosageAgentJob" ADD CONSTRAINT "DosageAgentJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
