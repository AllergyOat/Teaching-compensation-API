-- CreateEnum
CREATE TYPE "public"."Section" AS ENUM ('LECTURE', 'LAB');

-- AlterTable
ALTER TABLE "public"."Form" ADD COLUMN     "section" "public"."Section" NOT NULL DEFAULT 'LECTURE';
