import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { AdminRole, CourseParticipantRole } from "@prisma/client";

const PARTICIPANT_ROLE_LABELS: Record<CourseParticipantRole, string> = {
  MUSICIEN: "musicien·ne",
  CO_ENSEIGNANT: "co-enseignant·e",
};

// Retire une personne rattachée à un cours — réservé à qui peut gérer les
// cours (demande de Rene du 18.09.2026, voir canManageCourses ; auparavant
// réservé au seul compte ADMIN).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; participantId: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à modifier les personnes rattachées à un cours." }, { status: 403 });
  }

  const participant = await prisma.courseParticipant.findUnique({
    where: { id: params.participantId },
    include: { teacher: { select: { name: true } }, course: { select: { nomCours: true, code: true } } },
  });
  if (!participant || participant.courseId !== params.id) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  await prisma.courseParticipant.delete({ where: { id: params.participantId } });

  await logAdminAction(admin, {
    action: "course.participant_removed",
    entityType: "CourseParticipant",
    entityId: params.participantId,
    description: `${participant.teacher.name} retiré·e du cours ${participant.course.nomCours} (${participant.course.code}) (était ${PARTICIPANT_ROLE_LABELS[participant.role]})`,
  });

  return NextResponse.json({ ok: true });
}
