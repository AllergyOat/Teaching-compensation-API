-- AlterTable
ALTER TABLE "public"."SemesterTracking" ADD COLUMN     "program" "public"."Program" NOT NULL DEFAULT 'REGULAR_PROGRAM';

-- AlterTable
ALTER TABLE "public"."SubjectSectionRate" ALTER COLUMN "program" SET DEFAULT 'REGULAR_PROGRAM';
