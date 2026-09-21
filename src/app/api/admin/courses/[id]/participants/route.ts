import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { AdminRole, CourseParticipantRole } from "@prisma/client";

const PARTICIPANT_ROLE_LABELS: Record<CourseParticipantRole, string> = {
  MUSICIEN: "musicien·ne",
  CO_ENSEIGNANT: "co-enseignant·e",
};

// Rattache une personne supplémentaire à un cours (musicien·ne
// accompagnateur·rice, co-prof) sans toucher au·à la titulaire du cours —
// réservé à qui peut gérer les cours (demande de Rene du 18.09.2026, voir
// canManageCourses ; auparavant réservé au seul compte ADMIN).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à modifier les personnes rattachées à un cours." }, { status: 403 });
  }

  const { teacherId, role } = await req.json();
  if (!teacherId) {
    return NextResponse.json({ error: "Sélectionnez une personne." }, { status: 400 });
  }
  const participantRole: CourseParticipantRole =
    role && role in CourseParticipantRole ? role : CourseParticipantRole.MUSICIEN;

  const course = await prisma.course.findUnique({ where: { id: params.id } });
  if (!course) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });

  try {
    const participant = await prisma.courseParticipant.create({
      data: { courseId: params.id, teacherId, role: participantRole },
      include: { teacher: { select: { id: true, name: true, role: true } } },
    });

    await logAdminAction(admin, {
      action: "course.participant_added",
      entityType: "CourseParticipant",
      entityId: participant.id,
      description: `${participant.teacher.name} rattaché·e comme ${PARTICIPANT_ROLE_LABELS[participantRole]} au cours ${course.nomCours} (${course.code})`,
    });

    return NextResponse.json({ participant });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Cette personne est déjà rattachée à ce cours." }, { status: 409 });
    }
    throw e;
  }
}
