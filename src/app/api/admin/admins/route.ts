import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, generateTempPassword, hashPassword } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { AdminRole } from "@prisma/client";

export async function GET() {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const admins = await prisma.adminUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { name, email, role } = await req.json();
  if (!name || !email || !role || !(role in AdminRole)) {
    return NextResponse.json({ error: "Nom, email et rôle (ADMIN/COMPTABILITE/DIRECTION) requis." }, { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const tempPassword = generateTempPassword();

  const created = await prisma.adminUser.create({
    data: {
      name,
      email: normalizedEmail,
      role,
      passwordHash: await hashPassword(tempPassword),
    },
  });

  try {
    await sendWelcomeEmail({ to: normalizedEmail, teacherName: name, tempPassword });
  } catch (e) {
    console.error("Échec d'envoi de l'email de bienvenue admin :", e);
  }

  return NextResponse.json({ admin: { id: created.id, name: created.name, email: created.email, role: created.role } });
}
