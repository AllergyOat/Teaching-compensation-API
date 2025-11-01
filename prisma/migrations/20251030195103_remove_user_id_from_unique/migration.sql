/*
  Warnings:

  - A unique constraint covering the columns `[semester,year,subjectId,sectionId,program]` on the table `SemesterTracking` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."SemesterTracking_userId_semester_year_subjectId_sectionId_p_key";

-- CreateIndex
CREATE UNIQUE INDEX "SemesterTracking_semester_year_subjectId_sectionId_program_key" ON "public"."SemesterTracking"("semester", "year", "subjectId", "sectionId", "program");
