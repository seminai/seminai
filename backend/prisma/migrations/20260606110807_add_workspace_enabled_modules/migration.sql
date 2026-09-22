-- CreateEnum
CREATE TYPE "WorkspaceModule" AS ENUM ('DCA', 'LABELS');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "enabledModules" "WorkspaceModule"[] DEFAULT ARRAY['DCA']::"WorkspaceModule"[];
