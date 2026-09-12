import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateTempPassword, hashPassword } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { AdminRole } from "@prisma/client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
  if (!teacher || !teacher.email) {
    return NextResponse.json({ error: "Ce prof n'a pas encore de compte." }, { status: 400 });
  }

  const tempPassword = generateTempPassword();
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await hashPassword(tempPassword), mustResetPwd: true },
  });

  try {
    await sendPasswordResetEmail({ to: teacher.email, teacherName: teacher.name, tempPassword });
  } catch (e) {
    console.error("Échec d'envoi de l'email :", e);
    return NextResponse.json({ error: "Mot de passe réinitialisé mais l'email n'a pas pu être envoyé." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
