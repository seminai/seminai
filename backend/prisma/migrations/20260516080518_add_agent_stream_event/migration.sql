-- CreateTable
CREATE TABLE "AgentStreamEvent" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStreamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentStreamEvent_threadId_seq_idx" ON "AgentStreamEvent"("threadId", "seq");

-- CreateIndex
CREATE INDEX "AgentStreamEvent_threadId_createdAt_idx" ON "AgentStreamEvent"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStreamEvent_threadId_seq_key" ON "AgentStreamEvent"("threadId", "seq");
