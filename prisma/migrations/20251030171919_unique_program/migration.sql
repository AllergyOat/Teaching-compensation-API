/*
  Warnings:

  - A unique constraint covering the columns `[subjectId,sectionId,semester,program]` on the table `SubjectSectionRate` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."SubjectSectionRate_subjectId_sectionId_semester_key";

-- CreateIndex
CREATE UNIQUE INDEX "SubjectSectionRate_subjectId_sectionId_semester_program_key" ON "public"."SubjectSectionRate"("subjectId", "sectionId", "semester", "program");
