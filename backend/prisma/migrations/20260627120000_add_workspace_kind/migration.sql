-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('AGRICULTURAL', 'MANUFACTURING');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "kind" "WorkspaceKind" NOT NULL DEFAULT 'AGRICULTURAL';
