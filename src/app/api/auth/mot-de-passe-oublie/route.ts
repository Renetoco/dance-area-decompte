import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

// Réponse volontairement générique (pas d'indication si l'email existe ou
// non) — mais on envoie bien un nouveau mot de passe si un compte actif
// correspond.
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email requis." }, { status: 400 });
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  const teacher = await prisma.teacher.findUnique({ where: { email: normalizedEmail } });
  if (teacher && teacher.active) {
    const tempPassword = generateTempPassword();
    await prisma.teacher.update({
      where: { id: teacher.id },
      data: { passwordHash: await hashPassword(tempPassword), mustResetPwd: true },
    });
    try {
      await sendPasswordResetEmail({ to: teacher.email!, teacherName: teacher.name, tempPassword });
    } catch (e) {
      console.error("Échec d'envoi de l'email de réinitialisation :", e);
    }
  }

  const admin = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
  if (admin && admin.active) {
    const tempPassword = generateTempPassword();
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(tempPassword) },
    });
    try {
      await sendPasswordResetEmail({ to: admin.email, teacherName: admin.name, tempPassword });
    } catch (e) {
      console.error("Échec d'envoi de l'email de réinitialisation :", e);
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cet email, un nouveau mot de passe vient d'être envoyé.",
  });
}
