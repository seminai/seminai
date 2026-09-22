-- CreateTable
CREATE TABLE "AgentWorkingMemory" (
    "threadId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWorkingMemory_pkey" PRIMARY KEY ("threadId")
);

-- CreateIndex
CREATE INDEX "AgentWorkingMemory_updatedAt_idx" ON "AgentWorkingMemory"("updatedAt");
