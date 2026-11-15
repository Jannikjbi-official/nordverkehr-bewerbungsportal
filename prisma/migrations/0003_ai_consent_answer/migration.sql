-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "aiConsentAnswer" TEXT,
ADD COLUMN     "aiConsentAnsweredAt" TIMESTAMP(3),
ADD COLUMN     "aiConsentRequestedAt" TIMESTAMP(3);
