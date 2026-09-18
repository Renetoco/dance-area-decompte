import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { isWithinLateWindow } from "@/lib/dates";

/** Permet d'annuler une erreur de saisie tant que la fenêtre tardive AJB est ouverte. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const entry = await prisma.ajbLateEntry.findUnique({
    where: { id: params.id },
    include: { declaration: true },
  });
  if (!entry || entry.declaration.teacherId !== teacher.id) {
    return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  }
  if (!isWithinLateWindow(entry.declaration.period)) {
    return NextResponse.json({ error: "La fenêtre de saisie tardive AJB est fermée." }, { status: 403 });
  }

  await prisma.ajbLateEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
