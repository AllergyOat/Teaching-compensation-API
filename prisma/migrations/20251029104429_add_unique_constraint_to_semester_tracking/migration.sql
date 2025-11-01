-- DropIndex
DROP INDEX "public"."Form_userId_idx";

-- AlterTable
ALTER TABLE "public"."FormSections" ADD COLUMN     "totalHours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."SemesterTracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "public"."Section" NOT NULL,
    "totalHoursRequired" DOUBLE PRECISION NOT NULL,
    "hoursUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoursRemaining" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemesterTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SemesterTracking_userId_semester_year_idx" ON "public"."SemesterTracking"("userId", "semester", "year");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterTracking_userId_semester_year_subjectId_sectionId_key" ON "public"."SemesterTracking"("userId", "semester", "year", "subjectId", "sectionId");

-- CreateIndex
CREATE INDEX "Form_userId_semester_year_idx" ON "public"."Form"("userId", "semester", "year");

-- AddForeignKey
ALTER TABLE "public"."SemesterTracking" ADD CONSTRAINT "SemesterTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
