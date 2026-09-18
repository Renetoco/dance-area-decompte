import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { JOUR_VERS_INDEX } from "@/lib/dates";
import { AdminRole } from "@prisma/client";

// Fiche détaillée d'un cours : titulaire, participant·es (musicien·nes,
// co-profs), et tout l'historique des changements déclarés sur ce cours
// (toutes périodes confondues) — permet de voir si plusieurs profs sont
// intervenu·es sur le même cours, à la même date ou à des dates différentes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      teacher: { select: { id: true, name: true, email: true, role: true } },
      participants: {
        include: { teacher: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      declarationItems: {
        include: {
          otherTeacher: { select: { id: true, name: true } },
          declaration: { select: { period: true, teacher: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!course) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const history = course.declarationItems
    .map((item) => ({
      id: item.id,
      period: item.declaration.period,
      declaredBy: item.declaration.teacher,
      type: item.type,
      date: item.date,
      otherTeacher: item.otherTeacher,
      otherTeacherFreeText: item.otherTeacherFreeText,
      comment: item.comment,
    }))
    .sort((a, b) => (a.period === b.period ? 0 : a.period < b.period ? 1 : -1));

  const { declarationItems, ...courseFields } = course;
  return NextResponse.json({ course: { ...courseFields, history } });
}

// Modifie le nom, le jour, les horaires et le statut AJB d'un cours
// existant — ouvert à l'admin, la comptabilité et la direction (demande de
// Rene du 17.09.2026 : le code (identifiant analytique unique, référencé
// par les déclarations) n'est volontairement pas modifiable ici). Le
// statut actif/inactif (désactiver/réactiver, remplace la suppression pour
// un cours qui a de l'historique) est réservé à qui peut gérer les cours —
// voir canManageCourses (demande de Rene du 18.09.2026).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: params.id } });
  if (!course) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const body = await req.json();
  const { nomCours, jour, heureDebut, heureFin, isAJB, active } = body;

  if (nomCours !== undefined && (typeof nomCours !== "string" || !nomCours.trim())) {
    return NextResponse.json({ error: "Le nom du cours est requis." }, { status: 400 });
  }
  if (jour !== undefined && jour !== null && jour !== "" && !(jour in JOUR_VERS_INDEX)) {
    return NextResponse.json({ error: "Jour de la semaine invalide." }, { status: 400 });
  }
  if (active !== undefined && !canManageCourses(admin)) {
    return NextResponse.json(
      { error: "Non autorisé à désactiver/réactiver un cours." },
      { status: 403 }
    );
  }

  const updated = await prisma.course.update({
    where: { id: params.id },
    data: {
      ...(nomCours !== undefined ? { nomCours: nomCours.trim(), libelle: nomCours.trim() } : {}),
      ...(jour !== undefined ? { jour: jour || null } : {}),
      ...(heureDebut !== undefined ? { heureDebut: heureDebut || null } : {}),
      ...(heureFin !== undefined ? { heureFin: heureFin || null } : {}),
      ...(typeof isAJB === "boolean" ? { isAJB } : {}),
      ...(typeof active === "boolean" ? { active } : {}),
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
    },
  });

  return NextResponse.json({ course: updated });
}

// Supprime définitivement un cours — réservé aux cours sans aucun
// changement déclaré dessus (créés par erreur, doublon, etc.). Les
// participant·es supplémentaires (musicien·nes, co-profs) sont retiré·es en
// même temps, mais dès qu'un changement a été déclaré sur ce cours, la
// suppression est refusée pour ne jamais perdre d'historique — on désactive
// à la place (PATCH { active: false } ci-dessus). Réservé à l'admin, ou à
// un compte comptabilité/direction avec le réglage "gérer les cours" (voir
// canManageCourses, demande de Rene du 18.09.2026).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à supprimer des cours." }, { status: 403 });
  }

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    select: { id: true, _count: { select: { declarationItems: true } } },
  });
  if (!course) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  if (course._count.declarationItems > 0) {
    return NextResponse.json(
      { error: "Impossible de supprimer : des changements ont déjà été déclarés sur ce cours." },
      { status: 409 }
    );
  }

  await prisma.course.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
