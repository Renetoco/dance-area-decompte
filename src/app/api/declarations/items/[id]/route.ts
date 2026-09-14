import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isPastDeadline } from "@/lib/dates";

async function assertOwnedAndEditable(itemId: string, teacherId: string) {
  const item = await prisma.declarationItem.findUnique({
    where: { id: itemId },
    include: { declaration: true },
  });
  if (!item || item.declaration.teacherId !== teacherId) return null;
  if (isPastDeadline(item.declaration.period)) return "locked" as const;
  return item;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const check = await assertOwnedAndEditable(params.id, teacher.id);
  if (!check) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  if (check === "locked") {
    return NextResponse.json({ error: "Déclaration verrouillée (deadline dépassée)." }, { status: 403 });
  }

  const body = await req.json();
  const { type, courseId, date, otherTeacherId, otherTeacherFreeText, comment } = body;

  const item = await prisma.declarationItem.update({
    where: { id: params.id },
    data: {
      ...(type ? { type } : {}),
      courseId: courseId ?? null,
      date: date ? new Date(date) : null,
      otherTeacherId: otherTeacherId || null,
      otherTeacherFreeText: otherTeacherFreeText || null,
      comment: comment || null,
    },
    include: { course: true, otherTeacher: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const check = await assertOwnedAndEditable(params.id, teacher.id);
  if (!check) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  if (check === "locked") {
    return NextResponse.json({ error: "Déclaration verrouillée (deadline dépassée)." }, { status: 403 });
  }

  await prisma.declarationItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
