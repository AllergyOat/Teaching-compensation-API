/*
  Warnings:

  - A unique constraint covering the columns `[userId,semester,year,subjectId,sectionId,program]` on the table `SemesterTracking` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."SemesterTracking_userId_semester_year_idx";

-- DropIndex
DROP INDEX "public"."SemesterTracking_userId_semester_year_subjectId_sectionId_key";

-- CreateIndex
CREATE INDEX "SemesterTracking_semester_year_program_idx" ON "public"."SemesterTracking"("semester", "year", "program");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterTracking_userId_semester_year_subjectId_sectionId_p_key" ON "public"."SemesterTracking"("userId", "semester", "year", "subjectId", "sectionId", "program");
