-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'COMPTABILITE', 'DIRECTION');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'SUBMITTED_MANUAL', 'SUBMITTED_AUTO');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('REMPLACEMENT_EFFECTUE', 'ABSENCE_REMPLACEE', 'ABSENCE_NON_REMPLACEE', 'AUTRE');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('RAPPEL_J4', 'RAPPEL_J3', 'RAPPEL_J2', 'AUTO_SOUMISSION');

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "analyticCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "mustResetPwd" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "nomCours" TEXT NOT NULL,
    "jour" TEXT,
    "heureDebut" TEXT,
    "heureFin" TEXT,
    "quota" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teacherId" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyDeclaration" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "hasChanges" BOOLEAN,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeclarationItem" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "type" "ChangeType" NOT NULL,
    "courseId" TEXT,
    "date" TIMESTAMP(3),
    "otherTeacherId" TEXT,
    "otherTeacherFreeText" TEXT,
    "hours" DOUBLE PRECISION,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclarationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "jobDate" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_analyticCode_key" ON "Teacher"("analyticCode");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "MonthlyDeclaration_period_idx" ON "MonthlyDeclaration"("period");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyDeclaration_teacherId_period_key" ON "MonthlyDeclaration"("teacherId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "ReminderLog_period_type_idx" ON "ReminderLog"("period", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CronRun_jobDate_key" ON "CronRun"("jobDate");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyDeclaration" ADD CONSTRAINT "MonthlyDeclaration_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationItem" ADD CONSTRAINT "DeclarationItem_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "MonthlyDeclaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationItem" ADD CONSTRAINT "DeclarationItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeclarationItem" ADD CONSTRAINT "DeclarationItem_otherTeacherId_fkey" FOREIGN KEY ("otherTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
