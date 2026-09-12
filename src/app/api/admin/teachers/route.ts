import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";

export async function GET() {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const teachers = await prisma.teacher.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      analyticCode: true,
      name: true,
      email: true,
      active: true,
      mustResetPwd: true,
      _count: { select: { courses: true } },
    },
  });

  return NextResponse.json({ teachers });
}
