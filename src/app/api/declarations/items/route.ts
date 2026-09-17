import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isPastDeadline, isWithinLateWindow } from "@/lib/dates";
import { sendLateEntryAlert } from "@/lib/email";
import { ChangeType, DeclarationStatus, AdminRole } from "@prisma/client";

const TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué",
  ABSENCE_REMPLACEE: "Absence remplacée",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre changement",
};

export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const period = currentPeriod();
  const pastDeadline = isPastDeadline(period);
  const withinLateWindow = isWithinLateWindow(period);

  // Après la deadline, deux cas : dans la fenêtre tardive (20-26, voir
  // dates.ts) on accepte encore la saisie mais on la marque "tardive" sans
  // toucher à la déclaration déjà soumise ; après le 26, plus aucune
  // saisie n'est possible (demande de Rene du 17.09.2026).
  if (pastDeadline && !withinLateWindow) {
    return NextResponse.json(
      { error: "La période est close, plus aucune saisie n'est possible." },
      { status: 403 }
    );
  }
  const isLate = pastDeadline && withinLateWindow;

  const body = await req.json();
  const { type, courseId, date, otherTeacherId, otherTeacherFreeText, comment } = body;

  if (!type || !(type in ChangeType)) {
    return NextResponse.json({ error: "Type de changement invalide." }, { status: 400 });
  }

  const declaration = await prisma.monthlyDeclaration.upsert({
    where: { teacherId_period: { teacherId: teacher.id, period } },
    update: {},
    create: { teacherId: teacher.id, period },
  });

  // Une entrée tardive s'ajoute à la déclaration déjà soumise sans la
  // rouvrir (elle reste verrouillée, dans l'état officiellement envoyé) —
  // seule la ligne elle-même est marquée tardive. Avant la deadline, le
  // comportement existant est inchangé : modifier une déclaration déjà
  // soumise manuellement la repasse en brouillon.
  if (!isLate && declaration.status === DeclarationStatus.SUBMITTED_MANUAL) {
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
      comment: comment || null,
      tardif: isLate,
    },
    include: { course: true, otherTeacher: { select: { id: true, name: true } } },
  });

  if (isLate) {
    try {
      const recipients = await prisma.adminUser.findMany({
        where: { active: true, role: { in: [AdminRole.COMPTABILITE, AdminRole.DIRECTION] } },
        select: { email: true },
      });
      const to = recipients.map((r) => r.email).filter(Boolean);
      await sendLateEntryAlert({
        to,
        teacherName: teacher.name,
        period,
        item: {
          typeLabel: TYPE_LABELS[type] ?? type,
          courseLabel: item.course ? `${item.course.code} — ${item.course.nomCours}` : null,
          date: item.date ? item.date.toISOString().slice(0, 10) : null,
          comment: item.comment,
        },
      });
    } catch (e) {
      console.error("Échec d'envoi de l'alerte entrée tardive :", e);
    }
  }

  return NextResponse.json({ item });
}
