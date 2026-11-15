-- CreateTable
CREATE TABLE "DeadlineReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "DeadlineReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineReminder_positionId_sentAt_idx" ON "DeadlineReminder"("positionId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeadlineReminder_userId_positionId_key" ON "DeadlineReminder"("userId", "positionId");

-- AddForeignKey
ALTER TABLE "DeadlineReminder" ADD CONSTRAINT "DeadlineReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineReminder" ADD CONSTRAINT "DeadlineReminder_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

