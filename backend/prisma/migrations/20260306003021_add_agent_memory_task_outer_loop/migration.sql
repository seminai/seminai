-- CreateEnum
CREATE TYPE "AgentMemoryType" AS ENUM ('CORE', 'EPISODIC', 'PROCEDURAL', 'SEMANTIC');

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AgentMemoryType" NOT NULL,
    "key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OuterLoopTrigger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OuterLoopTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMemory_userId_type_idx" ON "AgentMemory"("userId", "type");

-- CreateIndex
CREATE INDEX "AgentMemory_userId_key_idx" ON "AgentMemory"("userId", "key");

-- CreateIndex
CREATE INDEX "AgentMemory_expiresAt_idx" ON "AgentMemory"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_userId_type_key_key" ON "AgentMemory"("userId", "type", "key");

-- CreateIndex
CREATE INDEX "AgentTask_threadId_idx" ON "AgentTask"("threadId");

-- CreateIndex
CREATE INDEX "AgentTask_chatId_idx" ON "AgentTask"("chatId");

-- CreateIndex
CREATE INDEX "OuterLoopTrigger_userId_status_scheduledAt_idx" ON "OuterLoopTrigger"("userId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OuterLoopTrigger_status_scheduledAt_idx" ON "OuterLoopTrigger"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OuterLoopTrigger" ADD CONSTRAINT "OuterLoopTrigger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
