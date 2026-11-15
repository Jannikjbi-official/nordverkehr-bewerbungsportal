-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "reviewChecklist" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ReviewCheck" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCheck_applicationId_item_key" ON "ReviewCheck"("applicationId", "item");

-- AddForeignKey
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

