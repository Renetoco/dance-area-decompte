-- Journal des actions structurelles backend (cours, profs, musicien·nes,
-- comptes) — demande de Rene du 18.09.2026, voir schema.prisma.
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminRole" "AdminRole" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");
