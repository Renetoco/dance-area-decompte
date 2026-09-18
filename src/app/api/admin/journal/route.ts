import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

// Journal des actions structurelles backend (cours, profs, musicien·nes,
// comptes) — consultation réservée au compte ADMIN (demande de Rene du
// 18.09.2026 : un outil de supervision, pas un espace partagé entre
// comptes backend).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

  const entries = await prisma.adminActionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const total = await prisma.adminActionLog.count();

  return NextResponse.json({ entries, total });
}
