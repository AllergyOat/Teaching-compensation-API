-- CreateTable
CREATE TABLE "public"."SubjectSectionRate" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "program" "public"."Program" NOT NULL,
    "section" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "public"."Section" NOT NULL,
    "ratePerHour" DOUBLE PRECISION NOT NULL,
    "MaxTotalHours" DOUBLE PRECISION NOT NULL,
    "teacherTotalHours" DOUBLE PRECISION,

    CONSTRAINT "SubjectSectionRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectSectionRate_subjectId_sectionId_semester_key" ON "public"."SubjectSectionRate"("subjectId", "sectionId", "semester");
