import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { computeConcordance } from "@/lib/concordance";
import { AdminRole, DeclarationStatus } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const declaration = await prisma.monthlyDeclaration.findUnique({
    where: { id: params.id },
    include: {
      teacher: { select: { id: true, name: true, analyticCode: true, email: true, active: true } },
      items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!declaration) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const itemsWithConcordance = await Promise.all(
    declaration.items.map(async (item) => ({
      ...item,
      concordance: await computeConcordance(item.id),
    }))
  );

  return NextResponse.json({ declaration: { ...declaration, items: itemsWithConcordance } });
}

// Réouverture exceptionnelle d'une déclaration verrouillée (admin uniquement)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const declaration = await prisma.monthlyDeclaration.update({
    where: { id: params.id },
    data: {
      status: DeclarationStatus.DRAFT,
      reopenedAt: new Date(),
      reopenedBy: admin.name,
    },
  });

  return NextResponse.json({ declaration });
}

// Efface complètement une déclaration (ex. test, erreur de saisie) — les
// changements qu'elle contient sont supprimés avec elle (cascade). Une
// déclaration vierge est recréée automatiquement dès que le prof revient
// sur son écran de décompte pour cette période.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const declaration = await prisma.monthlyDeclaration.findUnique({ where: { id: params.id } });
  if (!declaration) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  await prisma.monthlyDeclaration.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
