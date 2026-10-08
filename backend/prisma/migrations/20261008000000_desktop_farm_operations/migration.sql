ALTER TABLE "Stock" ADD COLUMN "occurredAt" TIMESTAMP(3), ADD COLUMN "reason" TEXT, ADD COLUMN "recordedBy" TEXT, ADD COLUMN "operationId" TEXT;
UPDATE "Stock" SET "occurredAt" = COALESCE("ddtDate", "invoiceDate", "createdAt");
ALTER TABLE "Stock" ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "occurredAt" SET NOT NULL;
CREATE TABLE "FarmOperation" (
 "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL, "connectionId" TEXT,
 "idempotencyKey" TEXT NOT NULL, "payload" JSONB NOT NULL, "preview" JSONB NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'pending', "result" JSONB,
 "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "FarmOperation_userId_idempotencyKey_key" ON "FarmOperation"("userId", "idempotencyKey");
CREATE INDEX "FarmOperation_companyId_status_idx" ON "FarmOperation"("companyId", "status");
CREATE TABLE "FarmAudit" ("id" TEXT PRIMARY KEY, "operationId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "version" INTEGER NOT NULL, "detail" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "FarmAudit_operationId_createdAt_idx" ON "FarmAudit"("operationId", "createdAt");
CREATE TABLE "McpConnection" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3));
CREATE UNIQUE INDEX "McpConnection_tokenHash_key" ON "McpConnection"("tokenHash");
CREATE INDEX "McpConnection_userId_companyId_idx" ON "McpConnection"("userId", "companyId");
CREATE TABLE "McpPairing" ("id" TEXT PRIMARY KEY, "secretHash" TEXT NOT NULL, "name" TEXT NOT NULL, "tokenEnc" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "approvedAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3));
CREATE TABLE "LocalKeyValue" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "DesktopQueueJob" ("id" TEXT PRIMARY KEY, "queue" TEXT NOT NULL, "name" TEXT NOT NULL, "progress" JSONB NOT NULL DEFAULT '0', "logs" JSONB NOT NULL DEFAULT '[]');
