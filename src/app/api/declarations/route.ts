import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isPastDeadline } from "@/lib/dates";
import { getDeclarationBundle, getOrCreateDeclaration, DECLARATION_INCLUDE } from "@/lib/declarationBundle";
import { DeclarationStatus } from "@prisma/client";

export async function GET() {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const bundle = await getDeclarationBundle(teacher.id, teacher.name, teacher.email);
  return NextResponse.json(bundle);
}

export async function PATCH(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const period = currentPeriod();
  if (isPastDeadline(period)) {
    return NextResponse.json({ error: "La deadline est dépassée, la déclaration est verrouillée." }, { status: 403 });
  }

  const body = await req.json();
  const { hasChanges, ajbCourseCount } = body;
  const declaration = await getOrCreateDeclaration(teacher.id, period);

  const data: {
    hasChanges?: boolean;
    status?: DeclarationStatus;
    submittedAt?: null;
    ajbCourseCount?: number | null;
  } = {};
  if (hasChanges !== undefined) data.hasChanges = hasChanges;
  if (ajbCourseCount !== undefined) {
    if (ajbCourseCount !== null && (typeof ajbCourseCount !== "number" || ajbCourseCount < 0 || !Number.isInteger(ajbCourseCount))) {
      return NextResponse.json({ error: "Nombre de cours AJB invalide." }, { status: 400 });
    }
    data.ajbCourseCount = ajbCourseCount;
  }
  if (declaration.status === DeclarationStatus.SUBMITTED_MANUAL) {
    // toute modification après soumission manuelle "rouvre" la déclaration
    data.status = DeclarationStatus.DRAFT;
    data.submittedAt = null;
  }
  if (hasChanges === false) {
    await prisma.declarationItem.deleteMany({ where: { declarationId: declaration.id } });
  }

  const updated = await prisma.monthlyDeclaration.update({
    where: { id: declaration.id },
    data,
    include: DECLARATION_INCLUDE,
  });

  return NextResponse.json({ declaration: updated });
}
