import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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

  const { name, email, role, active } = await req.json();
  const data: { name?: string; email?: string; role?: AdminRole; active?: boolean } = {};

  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof active === "boolean") data.active = active;
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
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json({ admin: updated });
}
