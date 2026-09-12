import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher, hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await hashPassword(newPassword), mustResetPwd: false },
  });

  return NextResponse.json({ ok: true });
}
