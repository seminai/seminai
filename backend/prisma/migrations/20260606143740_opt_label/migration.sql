-- DropForeignKey
ALTER TABLE "LabelHistory" DROP CONSTRAINT "LabelHistory_userId_fkey";

-- AddForeignKey
ALTER TABLE "LabelHistory" ADD CONSTRAINT "LabelHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LabelAlias_category_normalizedProductName_normalizedRegistratio" RENAME TO "LabelAlias_category_normalizedProductName_normalizedRegistr_key";
