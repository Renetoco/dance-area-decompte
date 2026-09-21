import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { AdminRole, TeacherRole } from "@prisma/client";

export async function GET() {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
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
      // courseParticipations comptée en plus de courses (titulaire) — un
      // prof/musicien·ne peut avoir 0 cours en tant que titulaire tout en
      // étant rattaché·e comme musicien·ne/co-enseignant·e ailleurs, ce qui
      // suffit à bloquer la suppression (confusion constatée le
      // 21.09.2026, voir DELETE /api/admin/teachers/[id]).
      _count: { select: { courses: true, courseParticipations: true } },
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
// Réservé à qui peut gérer les cours (demande de Rene du 18.09.2026, voir
// canManageCourses ; auparavant réservé au seul compte ADMIN).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à ajouter un prof." }, { status: 403 });
  }

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

  await logAdminAction(admin, {
    action: "teacher.created",
    entityType: "Teacher",
    entityId: created.id,
    description: `Prof créé·e : ${created.name} (${created.role === "MUSICIEN" ? "musicien·ne" : "enseignant·e"}, code ${created.analyticCode})`,
  });

  return NextResponse.json({ teacher: created });
}
