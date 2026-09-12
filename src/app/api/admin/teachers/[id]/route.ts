import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateTempPassword, hashPassword } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { AdminRole } from "@prisma/client";

// Met à jour l'email (ce qui active le compte s'il n'existait pas encore
// et envoie les identifiants) et/ou le statut actif/inactif d'un prof.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
  if (!teacher) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const { email, active } = await req.json();
  const data: { email?: string; active?: boolean; passwordHash?: string; mustResetPwd?: boolean } = {};

  if (typeof active === "boolean") data.active = active;

  let tempPassword: string | undefined;
  if (email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    data.email = normalizedEmail;
    if (!teacher.passwordHash) {
      // Première activation du compte : on génère un mot de passe temporaire.
      tempPassword = generateTempPassword();
      data.passwordHash = await hashPassword(tempPassword);
      data.mustResetPwd = true;
    }
  }

  const updated = await prisma.teacher.update({
    where: { id: params.id },
    data,
    select: { id: true, analyticCode: true, name: true, email: true, active: true, mustResetPwd: true },
  });

  if (tempPassword && updated.email) {
    try {
      await sendWelcomeEmail({ to: updated.email, teacherName: updated.name, tempPassword });
    } catch (e) {
      console.error("Échec d'envoi de l'email de bienvenue :", e);
    }
  }

  return NextResponse.json({ teacher: updated });
}
