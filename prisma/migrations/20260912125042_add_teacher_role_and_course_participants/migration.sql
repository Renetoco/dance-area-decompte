-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('ENSEIGNANT', 'MUSICIEN');

-- CreateEnum
CREATE TYPE "CourseParticipantRole" AS ENUM ('MUSICIEN', 'CO_ENSEIGNANT');

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "role" "TeacherRole" NOT NULL DEFAULT 'ENSEIGNANT';

-- CreateTable
CREATE TABLE "CourseParticipant" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" "CourseParticipantRole" NOT NULL DEFAULT 'MUSICIEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseParticipant_courseId_teacherId_key" ON "CourseParticipant"("courseId", "teacherId");

-- AddForeignKey
ALTER TABLE "CourseParticipant" ADD CONSTRAINT "CourseParticipant_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseParticipant" ADD CONSTRAINT "CourseParticipant_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

