/*
  Warnings:

  - You are about to drop the column `attempts` on the `PasswordResetOtp` table. All the data in the column will be lost.
  - You are about to drop the column `usedAt` on the `PasswordResetOtp` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `PasswordResetOtp` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."PasswordResetOtp_expiresAt_idx";

-- DropIndex
DROP INDEX "public"."PasswordResetOtp_userId_idx";

-- AlterTable
ALTER TABLE "public"."PasswordResetOtp" DROP COLUMN "attempts",
DROP COLUMN "usedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "used" BOOLEAN NOT NULL DEFAULT false;
