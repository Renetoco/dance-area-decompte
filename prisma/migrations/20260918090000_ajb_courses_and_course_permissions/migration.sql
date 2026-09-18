-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "ajbTeacher" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "isAJB" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MonthlyDeclaration" ADD COLUMN     "ajbCourseCount" INTEGER;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "canManageCourses" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AjbLateEntry" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "heure" TEXT,
    "nomCours" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjbLateEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AjbLateEntry" ADD CONSTRAINT "AjbLateEntry_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "MonthlyDeclaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
