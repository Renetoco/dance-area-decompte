import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isPastDeadline } from "@/lib/dates";
import { DeclarationStatus } from "@prisma/client";

export async function POST() {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const period = currentPeriod();
  if (isPastDeadline(period)) {
    return NextResponse.json({ error: "La deadline est dépassée." }, { status: 403 });
  }

  const declaration = await prisma.monthlyDeclaration.findUnique({
    where: { teacherId_period: { teacherId: teacher.id, period } },
  });
  if (!declaration) {
    return NextResponse.json({ error: "Aucune déclaration à soumettre." }, { status: 404 });
  }
  if (declaration.hasChanges === null || declaration.hasChanges === undefined) {
    return NextResponse.json(
      { error: "Merci d'indiquer d'abord s'il y a eu des changements ou non." },
      { status: 400 }
    );
  }

  const updated = await prisma.monthlyDeclaration.update({
    where: { id: declaration.id },
    data: { status: DeclarationStatus.SUBMITTED_MANUAL, submittedAt: new Date() },
  });

  return NextResponse.json({ declaration: updated });
}
