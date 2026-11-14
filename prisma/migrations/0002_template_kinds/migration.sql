-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[];

