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

// Crée un nouveau cours "à la main" (en dehors de l'import Excel annuel) —
// ex. un cours ajouté au planning en cours d'année. Le code doit être
// unique, comme dans le fichier Excel ("Code grp.").
export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { code, categorie, nomCours, jour, heureDebut, heureFin, quota, teacherId } = await req.json();
  if (!code || typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Le code du cours est requis." }, { status: 400 });
  }
  if (!nomCours || typeof nomCours !== "string" || !nomCours.trim()) {
    return NextResponse.json({ error: "Le nom du cours est requis." }, { status: 400 });
  }

  const normalizedCode = code.trim();
  const existing = await prisma.course.findUnique({ where: { code: normalizedCode } });
  if (existing) {
    return NextResponse.json({ error: "Ce code de cours est déjà utilisé." }, { status: 409 });
  }

  if (teacherId) {
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return NextResponse.json({ error: "Prof titulaire introuvable." }, { status: 400 });
  }

  const created = await prisma.course.create({
    data: {
      code: normalizedCode,
      categorie: (categorie || "").trim() || "Sans catégorie",
      libelle: nomCours.trim(),
      nomCours: nomCours.trim(),
      jour: jour || null,
      heureDebut: heureDebut || null,
      heureFin: heureFin || null,
      quota: quota ? Number(quota) : null,
      teacherId: teacherId || null,
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
    },
  });

  return NextResponse.json({ course: created });
}
