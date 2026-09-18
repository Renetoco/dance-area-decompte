import { cookies } from "next/headers";
import { getIronSession, IronSession } from "iron-session";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "./db";
import type { AdminRole, AdminUser } from "@prisma/client";

export type SessionData = {
  userType?: "teacher" | "admin";
  userId?: string;
  adminRole?: AdminRole;
};

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  // Pas de repli codé en dur : un secret manquant ou trop court permettrait
  // de forger des cookies de session (voir SECURITY-REVIEW.md #1).
  throw new Error(
    "SESSION_SECRET manquant ou trop court (32 caractères minimum). " +
      "Générez-en un avec `openssl rand -base64 48` et renseignez-le dans .env (local) " +
      "et dans les variables d'environnement Vercel (toutes les environnements)."
  );
}

// Durée de vie du cookie : plus courte pour les comptes admin/compta/direction
// (plus de privilèges) que pour les profs, qui ne se connectent qu'une fois
// par mois pour leur décompte — voir SECURITY-REVIEW.md #10.
const TEACHER_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 heures

const sessionOptions = {
  password: SESSION_SECRET,
  cookieName: "dancearea_decompte_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: TEACHER_MAX_AGE,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

/** À appeler juste avant session.save() lors d'une connexion admin, pour
 * raccourcir la durée de vie du cookie par rapport aux profs. */
export function applyAdminSessionTTL(session: IronSession<SessionData>) {
  session.updateConfig({
    ...sessionOptions,
    cookieOptions: { ...sessionOptions.cookieOptions, maxAge: ADMIN_MAX_AGE },
  });
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Génère un mot de passe temporaire lisible (pour la création de compte par
 * l'admin ou une réinitialisation). RNG cryptographique + espace de clés
 * élargi — voir SECURITY-REVIEW.md #3 (Math.random() / ~72k combinaisons
 * était trivialement brute-forçable). */
export function generateTempPassword(): string {
  const words = [
    "danse", "genve", "ballet", "studio", "rythme", "scene", "salsa", "tango",
    "valse", "swing", "hiphop", "jazzy", "pointe", "barre", "adage", "grave",
    "kizomba", "flamenco", "capoeira", "batucada",
  ];
  const w1 = words[randomInt(words.length)];
  const w2 = words[randomInt(words.length)];
  const num = randomInt(100000, 1000000); // 6 chiffres
  // ~20 * 20 * 900000 ≈ 360 millions de combinaisons, tiré par crypto.randomInt.
  return `${w1}-${w2}-${num}`;
}

/**
 * Compte(s) administrateur protégé(s) : ne peuvent jamais être ni
 * supprimés, ni désactivés, par personne (même par leur propre
 * titulaire), quel que soit qui est connecté. Sert à éviter qu'on se
 * retrouve sans aucun accès admin/direction fonctionnel.
 */
export const PROTECTED_ADMIN_EMAILS = ["rene.torres@dancearea.ch", "anastasia@dancearea.ch"];

export function isProtectedAdminEmail(email: string): boolean {
  return PROTECTED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Droit d'ajouter, désactiver/réactiver ou supprimer des cours — au-delà de
 * la simple modification des champs (nom/jour/horaire/AJB), déjà ouverte à
 * Comptabilité/Direction. Un compte ADMIN l'a toujours ; sinon il faut le
 * réglage individuel AdminUser.canManageCourses (demande de Rene du
 * 18.09.2026, accordé à Aurélie/Laure/Marine sans l'ouvrir à tout le rôle).
 */
export function canManageCourses(admin: Pick<AdminUser, "role" | "canManageCourses">): boolean {
  return admin.role === "ADMIN" || admin.canManageCourses;
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
