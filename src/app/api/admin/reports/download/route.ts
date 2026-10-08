import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

// Télécharge un rapport archivé tel qu'il a été envoyé (voir MonthlyReport
// dans schema.prisma) — même accès que /api/admin/reports et le bouton
// Export de la vue d'ensemble.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period");
  const kind = searchParams.get("kind");
  if (!period || (kind !== "verrouillage" && kind !== "final")) {
    return NextResponse.json({ error: "Paramètres period/kind manquants ou invalides." }, { status: 400 });
  }

  const report = await prisma.monthlyReport.findUnique({
    where: { period_kind: { period, kind } },
  });
  if (!report) {
    return NextResponse.json({ error: "Aucun rapport archivé pour cette période." }, { status: 404 });
  }

  const suffix = kind === "verrouillage" ? "verrouillage-20" : "final-26";

  return new NextResponse(new Uint8Array(report.fileData), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="decompte-dance-area-${period}-${suffix}.xlsx"`,
    },
  });
}
