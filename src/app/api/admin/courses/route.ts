import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

// Liste des cours, avec le·la titulaire et le nombre de participant·es
// supplémentaires (musicien·nes, co-profs) — utilisée par /admin/cours.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const courses = await prisma.course.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { nomCours: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { teacher: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      code: true,
      categorie: true,
      nomCours: true,
      jour: true,
      heureDebut: true,
      heureFin: true,
      teacher: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
    },
    orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
  });

  return NextResponse.json({ courses });
}
