import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isPastDeadline } from "@/lib/dates";
import { ChangeType, DeclarationStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const period = currentPeriod();
  if (isPastDeadline(period)) {
    return NextResponse.json({ error: "La deadline est dépassée, la déclaration est verrouillée." }, { status: 403 });
  }

  const body = await req.json();
  const { type, courseId, date, otherTeacherId, otherTeacherFreeText, hours, comment } = body;

  if (!type || !(type in ChangeType)) {
    return NextResponse.json({ error: "Type de changement invalide." }, { status: 400 });
  }

  const declaration = await prisma.monthlyDeclaration.upsert({
    where: { teacherId_period: { teacherId: teacher.id, period } },
    update: {},
    create: { teacherId: teacher.id, period },
  });

  if (declaration.status === DeclarationStatus.SUBMITTED_MANUAL) {
    await prisma.monthlyDeclaration.update({
      where: { id: declaration.id },
      data: { status: DeclarationStatus.DRAFT, submittedAt: null },
    });
  }

  const item = await prisma.declarationItem.create({
    data: {
      declarationId: declaration.id,
      type,
      courseId: courseId || null,
      date: date ? new Date(date) : null,
      otherTeacherId: otherTeacherId || null,
      otherTeacherFreeText: otherTeacherFreeText || null,
      hours: hours != null && hours !== "" ? Number(hours) : null,
      comment: comment || null,
    },
    include: { course: true, otherTeacher: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ item });
}
