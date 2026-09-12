import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis." }, { status: 400 });
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  const teacher = await prisma.teacher.findUnique({ where: { email: normalizedEmail } });
  if (teacher && teacher.active && teacher.passwordHash) {
    const ok = await verifyPassword(password, teacher.passwordHash);
    if (ok) {
      const session = await getSession();
      session.userType = "teacher";
      session.userId = teacher.id;
      await session.save();
      return NextResponse.json({
        ok: true,
        redirect: teacher.mustResetPwd ? "/prof/mot-de-passe" : "/prof",
      });
    }
  }

  const admin = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
  if (admin && admin.active) {
    const ok = await verifyPassword(password, admin.passwordHash);
    if (ok) {
      const session = await getSession();
      session.userType = "admin";
      session.userId = admin.id;
      session.adminRole = admin.role;
      await session.save();
      return NextResponse.json({ ok: true, redirect: "/admin" });
    }
  }

  return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
}
