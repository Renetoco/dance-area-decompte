import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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
      hours: item.hours,
      comment: item.comment,
    }))
    .sort((a, b) => (a.period === b.period ? 0 : a.period < b.period ? 1 : -1));

  const { declarationItems, ...courseFields } = course;
  return NextResponse.json({ course: { ...courseFields, history } });
}

// Supprime définitivement un cours — réservé aux cours sans aucun
// changement déclaré dessus (créés par erreur, doublon, etc.). Les
// participant·es supplémentaires (musicien·nes, co-profs) sont retiré·es en
// même temps, mais dès qu'un changement a été déclaré sur ce cours, la
// suppression est refusée pour ne jamais perdre d'historique.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

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
