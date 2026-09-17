-- AlterEnum
ALTER TYPE "ReminderType" ADD VALUE 'RAPPEL_J0';

-- AlterTable
ALTER TABLE "DeclarationItem" ADD COLUMN     "tardif" BOOLEAN NOT NULL DEFAULT false;
