import { prisma } from "./db";
import {
  currentPeriod,
  formatPeriodLabel,
  formatDeadlineLabel,
  formatLateWindowEndLabel,
  isPastDeadline,
  isWithinLateWindow,
} from "./dates";

export const DECLARATION_INCLUDE = {
  items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  ajbLateEntries: { orderBy: { createdAt: "asc" as const } },
};

export async function getOrCreateDeclaration(teacherId: string, period: string) {
  const existing = await prisma.monthlyDeclaration.findUnique({
    where: { teacherId_period: { teacherId, period } },
    include: DECLARATION_INCLUDE,
  });
  if (existing) return existing;
  return prisma.monthlyDeclaration.create({
    data: { teacherId, period },
    include: DECLARATION_INCLUDE,
  });
}

/** Tout ce dont l'interface prof a besoin pour afficher le décompte du cycle en cours. */
export async function getDeclarationBundle(teacherId: string, teacherName: string, teacherEmail: string | null) {
  const period = currentPeriod();
  const declaration = await getOrCreateDeclaration(teacherId, period);
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { ajbTeacher: true } });

  const [myCourses, otherCourses, teachers] = await Promise.all([
    prisma.course.findMany({ where: { teacherId, active: true }, orderBy: { jour: "asc" } }),
    prisma.course.findMany({
      where: { teacherId: { not: teacherId }, active: true },
      orderBy: [{ nomCours: "asc" }],
    }),
    prisma.teacher.findMany({
      where: { id: { not: teacherId }, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    teacher: { id: teacherId, name: teacherName, email: teacherEmail },
    period,
    periodLabel: formatPeriodLabel(period),
    deadlineLabel: formatDeadlineLabel(period),
    locked: isPastDeadline(period),
    lateWindowOpen: isWithinLateWindow(period),
    lateWindowEndLabel: formatLateWindowEndLabel(period),
    // Donne des cours AJB (Area Jeune Ballet) — voir Teacher.ajbTeacher.
    // Fait apparaître, côté prof, le champ "cours AJB donnés" et l'option
    // d'entrée tardive AJB — demande de Rene du 18.09.2026.
    isAjbTeacher: teacher?.ajbTeacher ?? false,
    declaration,
    myCourses,
    otherCourses,
    teachers,
  };
}

export type DeclarationBundle = Awaited<ReturnType<typeof getDeclarationBundle>>;
