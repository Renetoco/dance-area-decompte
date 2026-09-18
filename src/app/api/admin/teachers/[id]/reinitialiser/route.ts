import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses, generateTempPassword, hashPassword } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { sendPasswordResetEmail } from "@/lib/email";
import { AdminRole } from "@prisma/client";

// Réservé à qui peut gérer les cours (demande de Rene du 18.09.2026, voir
// canManageCourses ; auparavant réservé au seul compte ADMIN) — cohérent
// avec le reste de la gestion des profs sur /admin/profs.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à réinitialiser le mot de passe de ce prof." }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
  if (!teacher || !teacher.email) {
    return NextResponse.json({ error: "Ce prof n'a pas encore de compte." }, { status: 400 });
  }

  const tempPassword = generateTempPassword();
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await hashPassword(tempPassword), mustResetPwd: true },
  });

  await logAdminAction(admin, {
    action: "teacher.password_reset",
    entityType: "Teacher",
    entityId: teacher.id,
    description: `Mot de passe réinitialisé pour ${teacher.name}`,
  });

  try {
    await sendPasswordResetEmail({ to: teacher.email, teacherName: teacher.name, tempPassword });
  } catch (e) {
    console.error("Échec d'envoi de l'email :", e);
    return NextResponse.json({ error: "Mot de passe réinitialisé mais l'email n'a pas pu être envoyé." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
