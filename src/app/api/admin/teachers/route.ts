import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminRole, TeacherRole } from "@prisma/client";

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
      role: true,
      ajbTeacher: true,
      _count: { select: { courses: true } },
    },
  });

  return NextResponse.json({ teachers });
}

// Crée un nouveau prof "à la main" (en dehors de l'import Excel annuel) —
// ex. une nouvelle recrue en cours d'année. Le code analytique doit être
// unique : c'est la clé utilisée pour rapprocher les cours et l'export
// comptable, donc on laisse l'admin le choisir explicitement plutôt que
// d'en générer un qui pourrait entrer en collision avec le fichier Excel.
// Créé sans email/mot de passe, comme un prof importé : on active le compte
// ensuite via le même bouton "Activer" (email + mot de passe temporaire).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  const { name, analyticCode, role } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
  }
  if (!analyticCode || typeof analyticCode !== "string" || !analyticCode.trim()) {
    return NextResponse.json({ error: "Le code analytique est requis." }, { status: 400 });
  }

  const normalizedCode = analyticCode.trim();
  const existingCode = await prisma.teacher.findUnique({ where: { analyticCode: normalizedCode } });
  if (existingCode) {
    return NextResponse.json({ error: "Ce code analytique est déjà utilisé par un autre prof." }, { status: 409 });
  }

  const created = await prisma.teacher.create({
    data: {
      name: name.trim(),
      analyticCode: normalizedCode,
      role: role && role in TeacherRole ? (role as TeacherRole) : TeacherRole.ENSEIGNANT,
    },
    select: { id: true, analyticCode: true, name: true, email: true, active: true, role: true },
  });

  return NextResponse.json({ teacher: created });
}
