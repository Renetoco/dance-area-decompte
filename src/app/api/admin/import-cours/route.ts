import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { AdminRole } from "@prisma/client";

/**
 * Import annuel du planning. Le fichier Excel source doit d'abord être
 * converti en JSON avec scripts/parse-cours.py (voir DEPLOIEMENT.md) — on
 * accepte ici directement ce JSON, pas le xlsx, pour ne pas dupliquer la
 * logique d'extraction jour/heure/nom de cours à deux endroits (Python et
 * Node). Opération idempotente : upsert par code de cours / code
 * analytique, ne supprime jamais un prof ou un cours existant.
 */
type CoursData = {
  courses: {
    categorie: string;
    code: string;
    libelle: string;
    nomCours: string;
    jour: string | null;
    heureDebut: string | null;
    heureFin: string | null;
    quota: number | null;
    actif: boolean;
    teacherCode: string | null;
  }[];
  teachers: { code: string; nom: string }[];
};

export async function POST(req: NextRequest) {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });

  let data: CoursData;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  if (!Array.isArray(data.courses) || !Array.isArray(data.teachers)) {
    return NextResponse.json(
      { error: "Format inattendu : attend { courses: [...], teachers: [...] }." },
      { status: 400 }
    );
  }

  const teacherIdByCode = new Map<string, string>();
  let teachersCreated = 0;
  for (const t of data.teachers) {
    const before = await prisma.teacher.findUnique({ where: { analyticCode: t.code } });
    const teacher = await prisma.teacher.upsert({
      where: { analyticCode: t.code },
      update: { name: t.nom },
      create: { analyticCode: t.code, name: t.nom, active: true, mustResetPwd: true },
    });
    if (!before) teachersCreated += 1;
    teacherIdByCode.set(t.code, teacher.id);
  }

  let coursesImported = 0;
  let coursesSkipped = 0;
  for (const c of data.courses) {
    const teacherId = c.teacherCode ? teacherIdByCode.get(c.teacherCode) : undefined;
    if (!teacherId) {
      coursesSkipped += 1;
      continue;
    }
    await prisma.course.upsert({
      where: { code: c.code },
      update: {
        categorie: c.categorie,
        libelle: c.libelle,
        nomCours: c.nomCours,
        jour: c.jour,
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
        quota: c.quota,
        active: c.actif,
        teacherId,
      },
      create: {
        code: c.code,
        categorie: c.categorie,
        libelle: c.libelle,
        nomCours: c.nomCours,
        jour: c.jour,
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
        quota: c.quota,
        active: c.actif,
        teacherId,
      },
    });
    coursesImported += 1;
  }

  await logAdminAction(admin, {
    action: "import.annual_run",
    entityType: "Course",
    description: `Import annuel exécuté : ${teachersCreated} prof(s) créé·e(s), ${coursesImported} cours importé·s${
      coursesSkipped > 0 ? `, ${coursesSkipped} ignoré·s (prof introuvable)` : ""
    }`,
  });

  return NextResponse.json({
    ok: true,
    teachersTotal: data.teachers.length,
    teachersCreated,
    coursesImported,
    coursesSkipped,
  });
}
