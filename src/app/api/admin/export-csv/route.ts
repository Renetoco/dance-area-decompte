import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateCsvForPeriod } from "@/lib/csv";
import { currentPeriod } from "@/lib/dates";
import { AdminRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  // Export réservé à la comptabilité et à l'admin (pas la direction, cf.
  // project/roles/roles-utilisateurs.md)
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || currentPeriod();

  const csv = await generateCsvForPeriod(period);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="decompte-dance-area-${period}.csv"`,
    },
  });
}
