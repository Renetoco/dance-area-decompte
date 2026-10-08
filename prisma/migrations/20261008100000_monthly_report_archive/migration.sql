-- Archive des rapports Excel envoyés automatiquement (verrouillage du 20,
-- résumé final du 26) — voir MonthlyReport dans schema.prisma.
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyReport_period_kind_key" ON "MonthlyReport"("period", "kind");

CREATE INDEX "MonthlyReport_period_idx" ON "MonthlyReport"("period");
