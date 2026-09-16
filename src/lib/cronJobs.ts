/**
 * Actions du cycle mensuel, déclenchées par /api/cron/daily — voir
 * project/orchestration/orchestration.md pour la séquence complète.
 *
 * Conçu pour être appelé au moins une fois par heure par N'IMPORTE QUEL
 * planificateur (Vercel Cron, ou un pingeur externe gratuit type
 * cron-job.org si l'hébergeur ne permet pas une fréquence horaire sur son
 * plan gratuit — voir DEPLOIEMENT.md). Chaque action vérifie elle-même,
 * à partir de l'heure de Genève, si c'est le bon moment d'agir, et est
 * protégée par un verrou (CronRun) pour ne s'exécuter qu'une seule fois
 * par jour même si le job est déclenché plus souvent.
 */
import { prisma } from "./db";
import {
  getZonedParts,
  currentPeriod,
  REMINDER_HOUR,
  DEADLINE_DAY,
  DEADLINE_HOUR,
} from "./dates";
import { sendReminderEmail, sendAutoSubmitNotice } from "./email";
import { DeclarationStatus } from "@prisma/client";

async function alreadyRan(jobKey: string): Promise<boolean> {
  const existing = await prisma.cronRun.findUnique({ where: { jobDate: jobKey } });
  return !!existing;
}

async function markRan(jobKey: string, summary: string) {
  await prisma.cronRun.create({ data: { jobDate: jobKey, summary } });
}

/** Le 1er du mois : crée le brouillon de déclaration pour chaque prof actif. */
async function ensureDeclarationsCreated(period: string, dateStr: string) {
  const jobKey = `${dateStr}:creation`;
  if (await alreadyRan(jobKey)) return { ran: false };

  const teachers = await prisma.teacher.findMany({ where: { active: true } });
  let created = 0;
  for (const teacher of teachers) {
    const res = await prisma.monthlyDeclaration.upsert({
      where: { teacherId_period: { teacherId: teacher.id, period } },
      update: {},
      create: { teacherId: teacher.id, period },
    });
    if (res) created += 1;
  }
  await markRan(jobKey, `${created} déclarations créées/vérifiées pour ${period}.`);
  return { ran: true, created };
}

/**
 * J-4 / J-2 / J-1 : rappel aux profs qui n'ont pas encore soumis manuellement.
 *
 * J-4 et J-2 ne relancent que les profs dont la déclaration du mois est
 * encore totalement vide (aucune réponse à "y a-t-il eu des changements ?",
 * aucune entrée saisie) : dès qu'un prof a commencé à s'en occuper, inutile
 * de le relancer. J-1, le dernier rappel avant la deadline, part à tous
 * ceux qui n'ont pas encore soumis, même s'ils ont un brouillon en cours —
 * c'est le dernier filet avant la clôture automatique (demande de Rene du
 * 16.09.2026).
 */
async function sendDueReminders(period: string, dateStr: string, offset: number) {
  const jobKey = `${dateStr}:reminder`;
  if (await alreadyRan(jobKey)) return { ran: false };

  const isFinalReminder = offset === 1;

  const notYetSubmitted = await prisma.teacher.findMany({
    where: {
      active: true,
      email: { not: null },
      OR: isFinalReminder
        ? [
            { declarations: { none: { period } } },
            {
              declarations: {
                some: { period, status: { not: DeclarationStatus.SUBMITTED_MANUAL } },
              },
            },
          ]
        : [
            { declarations: { none: { period } } },
            {
              declarations: {
                some: { period, hasChanges: null, items: { none: {} } },
              },
            },
          ],
    },
  });

  const reminderType = (
    { 4: "RAPPEL_J4", 2: "RAPPEL_J2", 1: "RAPPEL_J1" } as const
  )[offset as 4 | 2 | 1];

  let sent = 0;
  for (const teacher of notYetSubmitted) {
    if (!teacher.email) continue;
    try {
      await sendReminderEmail({
        to: teacher.email,
        teacherName: teacher.name,
        period,
        daysLeft: offset,
      });
      await prisma.reminderLog.create({
        data: { period, teacherId: teacher.id, type: reminderType! },
      });
      sent += 1;
    } catch (e) {
      console.error(`Échec d'envoi du rappel à ${teacher.email} :`, e);
    }
  }
  await markRan(jobKey, `Rappel J-${offset} envoyé à ${sent}/${notYetSubmitted.length} prof(s).`);
  return { ran: true, sent };
}

/** Le 20 à 21h : verrouille et auto-soumet tout ce qui n'a pas été soumis manuellement. */
async function lockAndAutoSubmit(period: string, dateStr: string) {
  const jobKey = `${dateStr}:deadline`;
  if (await alreadyRan(jobKey)) return { ran: false };

  const teachers = await prisma.teacher.findMany({ where: { active: true } });
  let autoSubmitted = 0;

  for (const teacher of teachers) {
    const declaration = await prisma.monthlyDeclaration.upsert({
      where: { teacherId_period: { teacherId: teacher.id, period } },
      update: {},
      create: { teacherId: teacher.id, period },
      include: { items: true },
    });

    if (declaration.status === DeclarationStatus.SUBMITTED_MANUAL) continue;

    const hadChanges = declaration.hasChanges === true && declaration.items.length > 0;
    await prisma.monthlyDeclaration.update({
      where: { id: declaration.id },
      data: {
        status: DeclarationStatus.SUBMITTED_AUTO,
        hasChanges: declaration.hasChanges ?? false,
        submittedAt: new Date(),
      },
    });
    await prisma.reminderLog.create({
      data: { period, teacherId: teacher.id, type: "AUTO_SOUMISSION" },
    });
    autoSubmitted += 1;

    if (teacher.email) {
      try {
        await sendAutoSubmitNotice({
          to: teacher.email,
          teacherName: teacher.name,
          period,
          hadChanges,
        });
      } catch (e) {
        console.error(`Échec d'envoi de la notif auto-soumission à ${teacher.email} :`, e);
      }
    }
  }

  await markRan(jobKey, `${autoSubmitted} déclaration(s) verrouillée(s) et soumise(s) automatiquement pour ${period}.`);
  return { ran: true, autoSubmitted };
}

export async function runDailyCronTick(now: Date = new Date()) {
  const { year, month, day, hour } = getZonedParts(now);
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const period = currentPeriod(now);
  const results: Record<string, unknown> = { dateStr, period, hour };

  if (day === 1) {
    results.creation = await ensureDeclarationsCreated(period, dateStr);
  }

  const reminderOffsetByDay: Record<number, number> = {
    [DEADLINE_DAY - 4]: 4,
    [DEADLINE_DAY - 2]: 2,
    [DEADLINE_DAY - 1]: 1,
  };
  if (day in reminderOffsetByDay && hour >= REMINDER_HOUR) {
    results.reminder = await sendDueReminders(period, dateStr, reminderOffsetByDay[day]);
  }

  if (day === DEADLINE_DAY && hour >= DEADLINE_HOUR) {
    results.deadline = await lockAndAutoSubmit(period, dateStr);
  }

  return results;
}
