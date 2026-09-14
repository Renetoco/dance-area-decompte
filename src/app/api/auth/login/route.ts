import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifyPassword, applyAdminSessionTTL } from "@/lib/auth";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rateLimit";

// SECURITY-REVIEW.md #2 : pas de limite historiquement -> brute force
// illimité. On limite par email ciblé (5 essais / 15 min) ET par IP (20
// essais / 15 min, tous comptes confondus) pour couvrir le cas d'un
// attaquant qui teste peu de tentatives sur beaucoup de comptes.
const PER_EMAIL = { maxAttempts: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };
const PER_IP = { maxAttempts: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis." }, { status: 400 });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const ip = getClientIp(req);

  const ipCheck = await checkRateLimit(`login:ip:${ip}`, PER_IP);
  if (!ipCheck.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives de connexion. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(ipCheck.retryAfterSeconds) } }
    );
  }
  const emailCheck = await checkRateLimit(`login:email:${normalizedEmail}`, PER_EMAIL);
  if (!emailCheck.allowed) {
    return NextResponse.json(
      { error: "Trop de tentatives de connexion. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(emailCheck.retryAfterSeconds) } }
    );
  }

  const teacher = await prisma.teacher.findUnique({ where: { email: normalizedEmail } });
  if (teacher && teacher.active && teacher.passwordHash) {
    const ok = await verifyPassword(password, teacher.passwordHash);
    if (ok) {
      await resetRateLimit(`login:email:${normalizedEmail}`);
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
      await resetRateLimit(`login:email:${normalizedEmail}`);
      const session = await getSession();
      applyAdminSessionTTL(session);
      session.userType = "admin";
      session.userId = admin.id;
      session.adminRole = admin.role;
      await session.save();
      return NextResponse.json({
        ok: true,
        redirect: admin.mustResetPwd ? "/admin-mot-de-passe" : "/admin",
      });
    }
  }

  return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
}
