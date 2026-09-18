import { prisma } from "./db";
import { occurrenceDatesInPeriod } from "./dates";
import { ChangeType, DeclarationStatus, TeacherRole } from "@prisma/client";

/**
 * Décompte par cours (et non par heures) — suite à la demande de la
 * comptabilité : l'école ne paie pas au nombre d'heures mais au nombre de
 * séances de cours données.
 *
 * Pour chaque prof actif, on construit un calendrier prévisionnel : une
 * "occurrence" par séance attendue de chacun de ses cours (titulaire ou
 * participation) entre le 1er et le 20 du mois (le jour de la semaine du
 * cours). Chaque changement déclaré qui tombe exactement sur une de ces
 * occurrences (même cours, même date) la marque "modifiée" ; sinon (un
 * remplacement fait sur le cours d'un·e collègue, un "Autre" sans cours, ou
 * une date qui ne correspond à aucune séance prévue) il part dans les
 * "ajustements hors planning" du prof — toujours compté dans le total,
 * juste présenté à part puisqu'il ne remplace pas une séance de son propre
 * planning.
 *
 * Impact de chaque type sur le total du mois :
 *   - REMPLACEMENT_EFFECTUE (a couvert un·e collègue)      -> +1 cours
 *   - ABSENCE_REMPLACEE (a été absent·e, remplacé·e)        -> -1 cours
 *   - ABSENCE_NON_REMPLACEE (absence, cours non remplacé)   -> -1 cours
 *   - AUTRE                                                  -> 0 (n'affecte jamais le total)
 *
 * "À vérifier" (pour un contrôle manuel avant la paie) : une ligne a un
 * commentaire rempli, OU cite un·e remplaçant·e en texte libre (donc pas un
 * compte de la liste des profs actifs) — indépendamment de son type.
 */

const DELTA_BY_TYPE: Record<ChangeType, number> = {
  REMPLACEMENT_EFFECTUE: 1,
  ABSENCE_REMPLACEE: -1,
  ABSENCE_NON_REMPLACEE: -1,
  AUTRE: 0,
};

function isAVerifier(item: { comment: string | null; otherTeacherFreeText: string | null }): boolean {
  return Boolean((item.comment && item.comment.trim()) || (item.otherTeacherFreeText && item.otherTeacherFreeText.trim()));
}

export type PayrollAdjustment = {
  itemId: string;
  type: ChangeType;
  delta: number; // +1 / -1 / 0 (0 pour AUTRE, qui n'affecte jamais le total)
  aVerifier: boolean; // commentaire rempli et/ou remplaçant·e hors liste
  tardif: boolean; // saisi après la deadline, dans la fenêtre de saisie tardive (voir dates.ts)
  courseLabel: string | null;
  date: string | null;
  autreProf: string | null;
  comment: string | null;
};

export type PayrollOccurrence = {
  courseId: string;
  courseLabel: string;
  jour: string;
  date: string; // "YYYY-MM-DD"
  status: "MODIFIEE" | "NON_MODIFIEE";
  adjustment: PayrollAdjustment | null;
};

export type AjbLateEntryRow = {
  date: string | null;
  heure: string | null;
  nomCours: string;
  comment: string | null;
};

export type PayrollTeacherRow = {
  teacherId: string;
  teacherName: string;
  analyticCode: string;
  role: TeacherRole;
  occurrences: PayrollOccurrence[]; // calendrier prévisionnel (cours à jour fixe uniquement), trié par date
  coursesSansJourFixe: number; // cours titulaire/participation sans jour fixe (ex. "packs") — hors calendrier, à vérifier manuellement
  coursesPrevus: number; // = occurrences.length (base du total)
  extraAdjustments: PayrollAdjustment[]; // changements non rattachés à une séance du planning propre du prof
  totalAjustementsCours: number; // somme de tous les deltas (occurrences + extra)
  totalFinal: number; // coursesPrevus + totalAjustementsCours + total AJB
  aVerifierCount: number; // nombre de lignes à vérifier (occurrences + extra)
  tardifCount: number; // nombre de lignes saisies après la deadline (occurrences + extra)
  declarationStatus: DeclarationStatus | null; // null = aucune déclaration pour cette période
  hasChanges: boolean | null;
  // Cours AJB : ne sont plus comptés automatiquement (trop de changements),
  // voir Course.isAJB — saisis à la main par les profs concerné·es
  // (Teacher.ajbTeacher). null = champ pas encore rempli (0 pris en
  // compte) ; distinct de 0 (rempli, aucun cours donné ce mois-ci).
  isAjbTeacher: boolean;
  ajbCourseCount: number | null;
  ajbLateEntries: AjbLateEntryRow[]; // entrées tardives AJB (20-26), chacune compte pour +1 dans le total
};

export async function computePayrollForPeriod(period: string, teacherIds?: string[]): Promise<PayrollTeacherRow[]> {
  const teachers = await prisma.teacher.findMany({
    where: {
      active: true,
      ...(teacherIds && teacherIds.length > 0 ? { id: { in: teacherIds } } : {}),
    },
    include: {
      courses: { where: { active: true } },
      courseParticipations: { include: { course: true } },
      declarations: {
        where: { period },
        include: {
          items: {
            include: {
              course: true,
              otherTeacher: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          ajbLateEntries: { orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return teachers.map((t) => {
    type BaseCourse = { id: string; code: string; nomCours: string; jour: string | null };
    // Les cours AJB (Course.isAJB) sortent du calendrier prévisionnel du·de
    // la titulaire (trop de changements pour être comptés automatiquement,
    // voir Teacher.ajbTeacher et MonthlyDeclaration.ajbCourseCount) — mais
    // pas des participations en tant que musicien·ne/co-prof, qui
    // continuent de fonctionner normalement.
    const baseCourses: BaseCourse[] = [
      ...t.courses.filter((c) => !c.isAJB),
      ...t.courseParticipations.filter((cp) => cp.course.active).map((cp) => cp.course),
    ];

    const occurrences: PayrollOccurrence[] = [];
    const occurrenceIndex = new Map<string, PayrollOccurrence>(); // clé "courseId|date"
    let coursesSansJourFixe = 0;

    for (const c of baseCourses) {
      if (!c.jour) {
        coursesSansJourFixe += 1;
        continue;
      }
      for (const date of occurrenceDatesInPeriod(c.jour, period)) {
        const occ: PayrollOccurrence = {
          courseId: c.id,
          courseLabel: `${c.code} — ${c.nomCours}`,
          jour: c.jour,
          date,
          status: "NON_MODIFIEE",
          adjustment: null,
        };
        occurrences.push(occ);
        occurrenceIndex.set(`${c.id}|${date}`, occ);
      }
    }
    occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const decl = t.declarations[0] ?? null;
    const extraAdjustments: PayrollAdjustment[] = [];
    let totalAjustementsCours = 0;
    let aVerifierCount = 0;
    let tardifCount = 0;

    if (decl) {
      for (const item of decl.items) {
        const aVerifier = isAVerifier(item);
        const delta = DELTA_BY_TYPE[item.type];
        const date = item.date ? item.date.toISOString().slice(0, 10) : null;
        const adjustment: PayrollAdjustment = {
          itemId: item.id,
          type: item.type,
          delta,
          aVerifier,
          tardif: item.tardif,
          courseLabel: item.course ? `${item.course.code} — ${item.course.nomCours}` : null,
          date,
          autreProf: item.otherTeacher?.name ?? item.otherTeacherFreeText ?? null,
          comment: item.comment ?? null,
        };

        if (aVerifier) aVerifierCount++;
        if (item.tardif) tardifCount++;
        totalAjustementsCours += delta;

        const slot = item.courseId && date ? occurrenceIndex.get(`${item.courseId}|${date}`) : undefined;
        if (slot && slot.status === "NON_MODIFIEE") {
          slot.status = "MODIFIEE";
          slot.adjustment = adjustment;
        } else {
          // Ne correspond à aucune séance du planning propre du prof (cours
          // d'un·e collègue remplacé·e, "Autre" sans cours, date qui ne
          // tombe pas sur une occurrence prévue, ou 2e changement sur la
          // même séance) — toujours compté, présenté à part.
          extraAdjustments.push(adjustment);
        }
      }
    }

    const coursesPrevus = occurrences.length;

    const ajbLateEntries: AjbLateEntryRow[] = (decl?.ajbLateEntries ?? []).map((e) => ({
      date: e.date ? e.date.toISOString().slice(0, 10) : null,
      heure: e.heure,
      nomCours: e.nomCours,
      comment: e.comment,
    }));
    // Chaque entrée tardive AJB compte pour +1, comme les autres lignes
    // tardives (voir DeclarationItem.tardif) — à la comptabilité de décider
    // ensuite, via l'export, si elle est prise en compte ce mois-ci ou reportée.
    const ajbTotal = (decl?.ajbCourseCount ?? 0) + ajbLateEntries.length;

    return {
      teacherId: t.id,
      teacherName: t.name,
      analyticCode: t.analyticCode,
      role: t.role,
      occurrences,
      coursesSansJourFixe,
      coursesPrevus,
      extraAdjustments,
      totalAjustementsCours,
      totalFinal: coursesPrevus + totalAjustementsCours + ajbTotal,
      aVerifierCount,
      tardifCount,
      declarationStatus: decl?.status ?? null,
      hasChanges: decl?.hasChanges ?? null,
      isAjbTeacher: t.ajbTeacher,
      ajbCourseCount: decl?.ajbCourseCount ?? null,
      ajbLateEntries,
    };
  });
}
