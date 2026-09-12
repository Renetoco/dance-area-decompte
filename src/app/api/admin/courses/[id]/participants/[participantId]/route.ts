import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; participantId: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const participant = await prisma.courseParticipant.findUnique({ where: { id: params.participantId } });
  if (!participant || participant.courseId !== params.id) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  await prisma.courseParticipant.delete({ where: { id: params.participantId } });
  return NextResponse.json({ ok: true });
}
