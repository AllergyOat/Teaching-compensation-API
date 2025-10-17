/*
  Warnings:

  - You are about to drop the column `scheduleId` on the `Compensation` table. All the data in the column will be lost.
  - Added the required column `formSectionId` to the `Compensation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalDate` to the `Compensation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalTime` to the `Compensation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Compensation" DROP CONSTRAINT "Compensation_scheduleId_fkey";

-- DropIndex
DROP INDEX "public"."Compensation_scheduleId_idx";

-- AlterTable
ALTER TABLE "public"."Compensation" DROP COLUMN "scheduleId",
ADD COLUMN     "formSectionId" TEXT NOT NULL,
ADD COLUMN     "originalDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "originalScheduleId" TEXT,
ADD COLUMN     "originalTime" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Compensation" ADD CONSTRAINT "Compensation_formSectionId_fkey" FOREIGN KEY ("formSectionId") REFERENCES "public"."FormSections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Compensation" ADD CONSTRAINT "Compensation_originalScheduleId_fkey" FOREIGN KEY ("originalScheduleId") REFERENCES "public"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
