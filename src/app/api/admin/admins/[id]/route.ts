import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isProtectedAdminEmail } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

// Corrige l'email (ou le nom / rôle / statut actif) d'un compte
// administrateur / comptabilité / direction déjà créé. Ne renvoie pas de
// nouveaux identifiants : contrairement à l'activation d'un prof, ce compte
// a déjà un mot de passe — l'admin peut orienter la personne vers "mot de
// passe oublié" si besoin après correction de son email.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const target = await prisma.adminUser.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const { name, email, role, active, canManageCourses } = await req.json();
  const data: {
    name?: string;
    email?: string;
    role?: AdminRole;
    active?: boolean;
    canManageCourses?: boolean;
  } = {};

  if (typeof name === "string" && name.trim()) data.name = name.trim();
  // Réglage individuel "gérer les cours" (ajout/désactivation/suppression),
  // indépendant du rôle — demande de Rene du 18.09.2026, voir
  // src/lib/auth.ts#canManageCourses.
  if (typeof canManageCourses === "boolean") data.canManageCourses = canManageCourses;
  if (typeof active === "boolean") {
    if (active === false && isProtectedAdminEmail(target.email)) {
      return NextResponse.json(
        { error: "Ce compte est protégé et ne peut pas être désactivé." },
        { status: 403 }
      );
    }
    data.active = active;
  }
  if (role && role in AdminRole) data.role = role;
  if (email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
    if (existing && existing.id !== target.id) {
      return NextResponse.json({ error: "Un compte utilise déjà cet email." }, { status: 409 });
    }
    data.email = normalizedEmail;
  }

  const updated = await prisma.adminUser.update({
    where: { id: params.id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true, canManageCourses: true },
  });

  return NextResponse.json({ admin: updated });
}

// Supprime définitivement un compte admin/comptabilité/direction. Le(s)
// compte(s) listé(s) dans PROTECTED_ADMIN_EMAILS ne peuvent jamais être
// supprimés (voir aussi le blocage de la désactivation dans PATCH
// ci-dessus), par personne — même par leur propre titulaire — pour éviter
// qu'un accès admin/direction ne disparaisse par erreur.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const target = await prisma.adminUser.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  if (isProtectedAdminEmail(target.email)) {
    return NextResponse.json({ error: "Ce compte est protégé et ne peut pas être supprimé." }, { status: 403 });
  }

  await prisma.adminUser.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
