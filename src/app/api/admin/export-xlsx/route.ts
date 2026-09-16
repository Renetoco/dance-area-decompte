import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateXlsxForPeriod } from "@/lib/xlsxExport";
import { currentPeriod } from "@/lib/dates";
import { AdminRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  // Export réservé à l'admin, la comptabilité et la direction (élargi à la
  // direction à la demande de Rene le 16.09.2026, pour qu'Anastasia ait le
  // même accès que la comptabilité).
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || currentPeriod();
  // teacherIds=id1,id2,... -> export limité à ces profs (sélection cochée
  // dans le tableau de bord) ; absent ou vide -> tous les profs actifs.
  const teacherIdsParam = searchParams.get("teacherIds");
  const teacherIds = teacherIdsParam
    ? teacherIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const buffer = await generateXlsxForPeriod(period, teacherIds);
  const suffix = teacherIds && teacherIds.length > 0 ? "-selection" : "";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="decompte-dance-area-${period}${suffix}.xlsx"`,
    },
  });
}
