import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { AdminRole } from "@prisma/client";

// Liste des cours, avec le·la titulaire et le nombre de participant·es
// supplémentaires (musicien·nes, co-profs) — utilisée par /admin/cours.
// includeInactive=1 : aussi les cours désactivés (pour les réactiver) —
// réservé à qui peut gérer les cours (voir canManageCourses).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const includeInactive = searchParams.get("includeInactive") === "1" && canManageCourses(admin);

  const courses = await prisma.course.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
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
      isAJB: true,
      active: true,
      teacher: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
    },
    orderBy: [{ active: "desc" }, { jour: "asc" }, { heureDebut: "asc" }],
  });

  return NextResponse.json({ courses });
}

// Crée un nouveau cours "à la main" (en dehors de l'import Excel annuel) —
// ex. un cours ajouté au planning en cours d'année. Le code doit être
// unique, comme dans le fichier Excel ("Code grp."). Réservé à l'admin, ou
// à un compte comptabilité/direction avec le réglage "gérer les cours"
// (demande de Rene du 18.09.2026, voir canManageCourses).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à ajouter des cours." }, { status: 403 });
  }

  const { code, categorie, nomCours, jour, heureDebut, heureFin, quota, teacherId, isAJB } = await req.json();
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
      isAJB: Boolean(isAJB),
    },
    select: {
      id: true,
      code: true,
      categorie: true,
      nomCours: true,
      jour: true,
      heureDebut: true,
      heureFin: true,
      isAJB: true,
      teacher: { select: { id: true, name: true } },
    },
  });

  await logAdminAction(admin, {
    action: "course.created",
    entityType: "Course",
    entityId: created.id,
    description: `Cours créé : ${created.nomCours} (${created.code})`,
  });

  return NextResponse.json({ course: created });
}
