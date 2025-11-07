/*
  Warnings:

  - The `section` column on the `SemesterTracking` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `section` column on the `SubjectSectionRate` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."SemesterTracking" DROP COLUMN "section",
ADD COLUMN     "section" "public"."Section" NOT NULL DEFAULT 'LECTURE';

-- AlterTable
ALTER TABLE "public"."SubjectSectionRate" DROP COLUMN "section",
ADD COLUMN     "section" "public"."Section" NOT NULL DEFAULT 'LECTURE';

-- CreateIndex
CREATE INDEX "SemesterTracking_semester_year_program_section_idx" ON "public"."SemesterTracking"("semester", "year", "program", "section");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterTracking_semester_year_subjectId_sectionId_program__key" ON "public"."SemesterTracking"("semester", "year", "subjectId", "sectionId", "program", "section");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectSectionRate_subjectId_sectionId_semester_program_sec_key" ON "public"."SubjectSectionRate"("subjectId", "sectionId", "semester", "program", "section");
