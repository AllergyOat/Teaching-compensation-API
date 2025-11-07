/*
  Warnings:

  - A unique constraint covering the columns `[semester,year,subjectId,sectionId,program,section]` on the table `SemesterTracking` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subjectId,sectionId,semester,program,section]` on the table `SubjectSectionRate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `section` to the `SemesterTracking` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."SemesterTracking_semester_year_program_idx";

-- DropIndex
DROP INDEX "public"."SemesterTracking_semester_year_subjectId_sectionId_program_key";

-- DropIndex
DROP INDEX "public"."SubjectSectionRate_subjectId_sectionId_semester_program_key";

-- AlterTable
ALTER TABLE "public"."SemesterTracking" ADD COLUMN     "section" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SemesterTracking_semester_year_program_section_idx" ON "public"."SemesterTracking"("semester", "year", "program", "section");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterTracking_semester_year_subjectId_sectionId_program__key" ON "public"."SemesterTracking"("semester", "year", "subjectId", "sectionId", "program", "section");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectSectionRate_subjectId_sectionId_semester_program_sec_key" ON "public"."SubjectSectionRate"("subjectId", "sectionId", "semester", "program", "section");
