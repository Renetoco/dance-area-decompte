import { prisma } from "./db";
import { currentPeriod, formatPeriodLabel, formatDeadlineLabel, isPastDeadline } from "./dates";

export async function getOrCreateDeclaration(teacherId: string, period: string) {
  const existing = await prisma.monthlyDeclaration.findUnique({
    where: { teacherId_period: { teacherId, period } },
    include: { items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (existing) return existing;
  return prisma.monthlyDeclaration.create({
    data: { teacherId, period },
    include: { items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
  });
}

/** Tout ce dont l'interface prof a besoin pour afficher le décompte du cycle en cours. */
export async function getDeclarationBundle(teacherId: string, teacherName: string, teacherEmail: string | null) {
  const period = currentPeriod();
  const declaration = await getOrCreateDeclaration(teacherId, period);

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
    declaration,
    myCourses,
    otherCourses,
    teachers,
  };
}

export type DeclarationBundle = Awaited<ReturnType<typeof getDeclarationBundle>>;
