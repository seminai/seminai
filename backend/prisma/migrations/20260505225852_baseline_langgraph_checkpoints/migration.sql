-- Baseline for LangGraph PostgresSaver checkpoint tables.
-- These tables are created and managed at runtime by the LangGraph checkpointer.
-- This migration only registers their existence in the Prisma migration history
-- so that `prisma migrate dev` no longer reports drift. CREATE TABLE IF NOT EXISTS
-- guarantees the migration is a no-op when the runtime has already created them.

CREATE TABLE IF NOT EXISTS "checkpoint_migrations" (
    "v" INTEGER NOT NULL,
    CONSTRAINT "checkpoint_migrations_pkey" PRIMARY KEY ("v")
);

CREATE TABLE IF NOT EXISTS "checkpoints" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "parent_checkpoint_id" TEXT,
    "type" TEXT,
    "checkpoint" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "checkpoint_id")
);

CREATE TABLE IF NOT EXISTS "checkpoint_blobs" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "blob" BYTEA,
    CONSTRAINT "checkpoint_blobs_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "channel", "version")
);

CREATE TABLE IF NOT EXISTS "checkpoint_writes" (
    "thread_id" TEXT NOT NULL,
    "checkpoint_ns" TEXT NOT NULL DEFAULT '',
    "checkpoint_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT,
    "blob" BYTEA NOT NULL,
    CONSTRAINT "checkpoint_writes_pkey" PRIMARY KEY ("thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx")
);
