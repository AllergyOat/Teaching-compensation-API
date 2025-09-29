/*
  Warnings:

  - You are about to drop the column `labId` on the `Form` table. All the data in the column will be lost.
  - You are about to drop the column `lectureId` on the `Form` table. All the data in the column will be lost.
  - You are about to drop the column `formId` on the `Schedule` table. All the data in the column will be lost.
  - Added the required column `formSectionId` to the `Schedule` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Schedule" DROP CONSTRAINT "Schedule_formId_fkey";

-- AlterTable
ALTER TABLE "public"."Form" DROP COLUMN "labId",
DROP COLUMN "lectureId";

-- AlterTable
ALTER TABLE "public"."Schedule" DROP COLUMN "formId",
ADD COLUMN     "formSectionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."FormSections" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "public"."Section" DEFAULT 'LECTURE',

    CONSTRAINT "FormSections_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."FormSections" ADD CONSTRAINT "FormSections_formId_fkey" FOREIGN KEY ("formId") REFERENCES "public"."Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_formSectionId_fkey" FOREIGN KEY ("formSectionId") REFERENCES "public"."FormSections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
