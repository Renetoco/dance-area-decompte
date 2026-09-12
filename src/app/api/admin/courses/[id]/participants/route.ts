import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole, CourseParticipantRole } from "@prisma/client";

// Rattache une personne supplémentaire à un cours (musicien·ne
// accompagnateur·rice, co-prof) sans toucher au·à la titulaire du cours.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

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
    return NextResponse.json({ participant });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Cette personne est déjà rattachée à ce cours." }, { status: 409 });
    }
    throw e;
  }
}
