import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

// Liste des rapports archivés (voir MonthlyReport dans schema.prisma) —
// même accès que le bouton Export de la vue d'ensemble (demande de Rene du
// 08.10.2026 : rendre ces rapports accessibles à tous les comptes backend,
// pas seulement via l'email reçu au moment de l'envoi).
export async function GET() {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const reports = await prisma.monthlyReport.findMany({
    select: { id: true, period: true, kind: true, generatedAt: true },
    orderBy: [{ period: "desc" }, { kind: "asc" }],
  });

  // Regroupé par période pour l'affichage (une ligne par mois, une colonne
  // par type de rapport) — voir AdminReports.tsx.
  const byPeriod = new Map<string, { period: string; verrouillage: string | null; final: string | null }>();
  for (const r of reports) {
    if (!byPeriod.has(r.period)) {
      byPeriod.set(r.period, { period: r.period, verrouillage: null, final: null });
    }
    const entry = byPeriod.get(r.period)!;
    if (r.kind === "verrouillage") entry.verrouillage = r.generatedAt.toISOString();
    if (r.kind === "final") entry.final = r.generatedAt.toISOString();
  }

  const periods = Array.from(byPeriod.values()).sort((a, b) => b.period.localeCompare(a.period));

  return NextResponse.json({ periods });
}
