-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "calibrationDate" TIMESTAMP(3),
ADD COLUMN     "calibrationReminderDays" INTEGER,
ADD COLUMN     "functionalControlDate" TIMESTAMP(3),
ADD COLUMN     "functionalControlReminderDays" INTEGER,
ADD COLUMN     "revisionReminderDays" INTEGER;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 5;
