import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod } from "@/lib/dates";
import { AdminRole, DeclarationStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || currentPeriod();
  const status = searchParams.get("status"); // DRAFT | SUBMITTED_MANUAL | SUBMITTED_AUTO
  const hasChanges = searchParams.get("hasChanges"); // "true" | "false"
  const teacherId = searchParams.get("teacherId");
  const q = searchParams.get("q"); // recherche par nom de prof

  const declarations = await prisma.monthlyDeclaration.findMany({
    where: {
      period,
      ...(status ? { status: status as DeclarationStatus } : {}),
      ...(hasChanges ? { hasChanges: hasChanges === "true" } : {}),
      ...(teacherId ? { teacherId } : {}),
      ...(q ? { teacher: { name: { contains: q, mode: "insensitive" } } } : {}),
    },
    include: {
      teacher: { select: { id: true, name: true, analyticCode: true, email: true } },
      items: true,
    },
    orderBy: { teacher: { name: "asc" } },
  });

  // Profs actifs sans déclaration créée pour la période (pas encore
  // atteints par le cron du 1er, ex. compte créé en cours de mois).
  const allTeachers = await prisma.teacher.findMany({
    where: { active: true },
    select: { id: true, name: true, analyticCode: true, email: true },
  });
  const declaredIds = new Set(declarations.map((d) => d.teacherId));
  const missing = allTeachers.filter((t) => !declaredIds.has(t.id));

  const summary = {
    total: allTeachers.length,
    soumisManuel: declarations.filter((d) => d.status === "SUBMITTED_MANUAL").length,
    soumisAuto: declarations.filter((d) => d.status === "SUBMITTED_AUTO").length,
    pasEncoreSoumis: declarations.filter((d) => d.status === "DRAFT").length + missing.length,
    avecChangements: declarations.filter((d) => d.hasChanges).length,
    sansChangements: declarations.filter((d) => d.hasChanges === false).length,
  };

  return NextResponse.json({ period, declarations, missingTeachers: missing, summary });
}
