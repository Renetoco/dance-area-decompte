import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// SECURITY-REVIEW.md #5 : cette route écrase le mot de passe en clair de
// n'importe quel compte actif à chaque appel, sans authentification.
// Sans limite, un attaquant peut verrouiller un compte connu (nouveau mot de
// passe envoyé par email dont il n'a pas connaissance) en boucle, et
// spammer le relais SMTP. On limite par compte ciblé ET par IP.
const PER_ACCOUNT = { maxAttempts: 3, windowMs: 60 * 60_000, lockMs: 60 * 60_000 };
const PER_IP = { maxAttempts: 10, windowMs: 60 * 60_000, lockMs: 60 * 60_000 };

const GENERIC_MESSAGE = "Si un compte existe avec cet email, un nouveau mot de passe vient d'être envoyé.";

// Réponse volontairement générique (pas d'indication si l'email existe ou
// non) — mais on envoie bien un nouveau mot de passe si un compte actif
// correspond.
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Email requis." }, { status: 400 });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const ip = getClientIp(req);

  const ipCheck = await checkRateLimit(`reset:ip:${ip}`, PER_IP);
  if (!ipCheck.allowed) {
    // Réponse générique même en cas de blocage, pour ne pas révéler la
    // présence d'une limite ni l'existence du compte.
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }
  const accountCheck = await checkRateLimit(`reset:email:${normalizedEmail}`, PER_ACCOUNT);
  if (!accountCheck.allowed) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

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
      data: { passwordHash: await hashPassword(tempPassword), mustResetPwd: true },
    });
    try {
      await sendPasswordResetEmail({ to: admin.email, teacherName: admin.name, tempPassword });
    } catch (e) {
      console.error("Échec d'envoi de l'email de réinitialisation :", e);
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
