-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "revenueCatId" TEXT,
  ADD COLUMN "subscriptionStatus" TEXT,
  ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);
