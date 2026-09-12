import { cookies } from "next/headers";
import { getIronSession, IronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { AdminRole } from "@prisma/client";

export type SessionData = {
  userType?: "teacher" | "admin";
  userId?: string;
  adminRole?: AdminRole;
};

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "dev-secret-change-me-in-production-min-32-chars",
  cookieName: "dancearea_decompte_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Génère un mot de passe temporaire lisible (pour la création de compte par l'admin). */
export function generateTempPassword(): string {
  const words = ["danse", "genve", "ballet", "studio", "rythme", "scene", "salsa", "tango"];
  const w = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${num}`;
}

/** À utiliser dans les pages/route handlers protégées côté prof. */
export async function requireTeacher() {
  const session = await getSession();
  if (session.userType !== "teacher" || !session.userId) {
    return null;
  }
  const teacher = await prisma.teacher.findUnique({ where: { id: session.userId } });
  if (!teacher || !teacher.active) return null;
  return teacher;
}

/** À utiliser dans les pages/route handlers protégées côté admin/compta/direction. */
export async function requireAdmin(allowedRoles?: AdminRole[]) {
  const session = await getSession();
  if (session.userType !== "admin" || !session.userId) {
    return null;
  }
  const admin = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!admin || !admin.active) return null;
  if (allowedRoles && !allowedRoles.includes(admin.role)) return null;
  return admin;
}
