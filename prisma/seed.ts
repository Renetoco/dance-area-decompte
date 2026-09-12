/**
 * Importe le planning des cours (data/cours.json, produit par
 * scripts/parse-cours.py à partir du fichier Excel) dans la base.
 *
 * Idempotent : peut être relancé (ex. réimport annuel) sans dupliquer les
 * cours ou les profs déjà connus — upsert par code de cours / code
 * analytique.
 *
 * Crée aussi un premier compte Admin à partir de ADMIN_EMAIL /
 * ADMIN_INITIAL_PASSWORD (variables d'environnement) si aucun compte
 * admin n'existe encore.
 */
import { PrismaClient, AdminRole } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

async function main() {
  const dataPath = join(__dirname, "../../data/cours.json");
  const data: CoursData = JSON.parse(readFileSync(dataPath, "utf-8"));

  console.log(`Import de ${data.teachers.length} profs et ${data.courses.length} cours...`);

  const teacherIdByCode = new Map<string, string>();
  for (const t of data.teachers) {
    const teacher = await prisma.teacher.upsert({
      where: { analyticCode: t.code },
      update: { name: t.nom },
      create: { analyticCode: t.code, name: t.nom, active: true, mustResetPwd: true },
    });
    teacherIdByCode.set(t.code, teacher.id);
  }

  let coursesWithoutTeacher = 0;
  for (const c of data.courses) {
    const teacherId = c.teacherCode ? teacherIdByCode.get(c.teacherCode) : undefined;
    if (!teacherId) {
      coursesWithoutTeacher += 1;
      continue; // packs sans prof rattaché (ex. "Etudes 1") — non pertinents pour les décomptes
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
  }
  console.log(
    `${data.courses.length - coursesWithoutTeacher} cours importés, ${coursesWithoutTeacher} ignorés (pas de prof rattaché, ex. forfaits Etudes/SAE).`
  );

  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_INITIAL_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD, 12);
    await prisma.adminUser.create({
      data: {
        name: "Administrateur",
        email: process.env.ADMIN_EMAIL,
        passwordHash,
        role: AdminRole.ADMIN,
      },
    });
    console.log(`Compte admin créé : ${process.env.ADMIN_EMAIL}`);
  } else if (adminCount === 0) {
    console.log(
      "Aucun compte admin créé (définissez ADMIN_EMAIL et ADMIN_INITIAL_PASSWORD dans .env pour en créer un automatiquement)."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
