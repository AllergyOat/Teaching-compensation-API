/*
  Warnings:

  - You are about to drop the column `formId` on the `Compensation` table. All the data in the column will be lost.
  - You are about to drop the column `previousDate` on the `Compensation` table. All the data in the column will be lost.
  - You are about to drop the column `previousTime` on the `Compensation` table. All the data in the column will be lost.
  - Added the required column `scheduleId` to the `Compensation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Compensation" DROP CONSTRAINT "Compensation_formId_fkey";

-- AlterTable
ALTER TABLE "public"."Compensation" DROP COLUMN "formId",
DROP COLUMN "previousDate",
DROP COLUMN "previousTime",
ADD COLUMN     "scheduleId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Compensation_scheduleId_idx" ON "public"."Compensation"("scheduleId");

-- AddForeignKey
ALTER TABLE "public"."Compensation" ADD CONSTRAINT "Compensation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
