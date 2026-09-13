import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateTempPassword, hashPassword, isProtectedAdminEmail } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { AdminRole } from "@prisma/client";

export async function GET() {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const admins = await prisma.adminUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return NextResponse.json({
    admins: admins.map((a) => ({ ...a, protected: isProtectedAdminEmail(a.email) })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { name, email, role, tempPassword: customTempPassword } = await req.json();
  if (!name || !email || !role || !(role in AdminRole)) {
    return NextResponse.json({ error: "Nom, email et rôle (ADMIN/COMPTABILITE/DIRECTION) requis." }, { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  // Un mot de passe temporaire peut être imposé (ex. pour communiquer des
  // identifiants de démo directement), sinon on en génère un.
  const tempPassword =
    typeof customTempPassword === "string" && customTempPassword.trim().length >= 6
      ? customTempPassword.trim()
      : generateTempPassword();

  const created = await prisma.adminUser.create({
    data: {
      name,
      email: normalizedEmail,
      role,
      passwordHash: await hashPassword(tempPassword),
    },
  });

  let emailSent = true;
  try {
    await sendWelcomeEmail({ to: normalizedEmail, teacherName: name, tempPassword });
  } catch (e) {
    emailSent = false;
    console.error("Échec d'envoi de l'email de bienvenue admin :", e);
  }

  // Le mot de passe temporaire est renvoyé une seule fois, à la création,
  // pour permettre de le communiquer directement (ex. démo, présentation)
  // même si l'email de bienvenue n'a pas pu être envoyé.
  return NextResponse.json({
    admin: { id: created.id, name: created.name, email: created.email, role: created.role },
    tempPassword,
    emailSent,
  });
}
