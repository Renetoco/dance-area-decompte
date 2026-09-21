import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isProtectedAdminEmail } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
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
  if (role && role in AdminRole && role !== target.role) {
    // Un compte ne peut être basculé qu'entre Comptabilité et Secrétariat
    // (mêmes droits, fréquence d'emails différente — voir cronJobs.ts) :
    // Admin et Direction ne changent jamais de catégorie par ce biais
    // (demande de Rene du 21.09.2026), et les comptes protégés (voir
    // isProtectedAdminEmail) sont toujours Admin ou Direction donc déjà
    // couverts par cette même règle.
    const SWITCHABLE: AdminRole[] = [AdminRole.COMPTABILITE, AdminRole.SECRETARIAT];
    if (!SWITCHABLE.includes(target.role) || !SWITCHABLE.includes(role)) {
      return NextResponse.json(
        { error: "Un compte ne peut être basculé qu'entre Comptabilité et Secrétariat." },
        { status: 403 }
      );
    }
    data.role = role;
  }
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

  if (typeof canManageCourses === "boolean" && canManageCourses !== target.canManageCourses) {
    await logAdminAction(admin, {
      action: canManageCourses ? "admin.can_manage_courses_granted" : "admin.can_manage_courses_revoked",
      entityType: "AdminUser",
      entityId: target.id,
      description: `Droit "Gérer les cours" ${canManageCourses ? "accordé" : "retiré"} pour ${updated.name}`,
    });
  }
  if (typeof active === "boolean" && active !== target.active) {
    await logAdminAction(admin, {
      action: active ? "admin.reactivated" : "admin.deactivated",
      entityType: "AdminUser",
      entityId: target.id,
      description: `Compte backend ${active ? "réactivé" : "désactivé"} : ${updated.name}`,
    });
  }
  if (role && role in AdminRole && role !== target.role) {
    await logAdminAction(admin, {
      action: "admin.role_changed",
      entityType: "AdminUser",
      entityId: target.id,
      description: `Rôle de ${updated.name} changé : ${target.role} → ${role}`,
    });
  }
  if (email && updated.email !== target.email) {
    await logAdminAction(admin, {
      action: "admin.email_changed",
      entityType: "AdminUser",
      entityId: target.id,
      description: `Email de ${updated.name} changé : ${target.email} → ${updated.email}`,
    });
  }

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

  await logAdminAction(admin, {
    action: "admin.deleted",
    entityType: "AdminUser",
    entityId: target.id,
    description: `Compte backend supprimé : ${target.name} (${target.email})`,
  });

  return NextResponse.json({ ok: true });
}
