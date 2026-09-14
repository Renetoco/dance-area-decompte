/**
 * Toute la logique de dates du cycle mensuel vit ici — voir
 * project/contexte/regles-metier.md pour la règle en langage naturel :
 *   - période déclarée : du 1er au 20 de chaque mois
 *   - deadline : le 20 à 21h00, heure de Genève (Europe/Zurich)
 *   - rappels : J-4, J-2, J-1 (donc les 16, 18, 19) à 09h00
 *
 * On n'utilise aucune librairie de dates externe : Node embarque une base
 * de fuseaux horaires complète (Intl), ce qui suffit pour ce besoin.
 */

export const TIMEZONE = "Europe/Zurich";
export const DEADLINE_DAY = 20;
export const DEADLINE_HOUR = 21;
export const REMINDER_OFFSETS_DAYS = [4, 2, 1] as const; // J-4, J-2, J-1
export const REMINDER_HOUR = 9;

/** Convertit une heure "murale" (ex. 20 septembre 2026, 21h00, à Genève) en Date UTC. */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string = TIMEZONE
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value])
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const diff = asIfUtc - utcGuess;
  return new Date(utcGuess - diff);
}

/** Décompose un instant en champs de date/heure murale dans le fuseau donné. */
export function getZonedParts(date: Date = new Date(), timeZone: string = TIMEZONE) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Période au format "2026-09", calculée sur la date du jour à Genève. */
export function currentPeriod(now: Date = new Date()): string {
  const { year, month } = getZonedParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodToYearMonth(period: string): { year: number; month: number } {
  const [y, m] = period.split("-").map(Number);
  return { year: y, month: m };
}

/** Instant (UTC) de la deadline pour une période "YYYY-MM". */
export function getDeadline(period: string): Date {
  const { year, month } = periodToYearMonth(period);
  return zonedTimeToUtc(year, month, DEADLINE_DAY, DEADLINE_HOUR, 0);
}

/** Instants (UTC) des 3 rappels (J-4, J-2, J-1) pour une période. */
export function getReminderDates(period: string): { offset: number; date: Date }[] {
  const { year, month } = periodToYearMonth(period);
  return REMINDER_OFFSETS_DAYS.map((offset) => ({
    offset,
    date: zonedTimeToUtc(year, month, DEADLINE_DAY - offset, REMINDER_HOUR, 0),
  }));
}

export function isPastDeadline(period: string, now: Date = new Date()): boolean {
  return now.getTime() >= getDeadline(period).getTime();
}

/** Libellé humain de la période, ex. "1 - 20 septembre 2026". */
export function formatPeriodLabel(period: string): string {
  const { year, month } = periodToYearMonth(period);
  const moisNoms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `1 - 20 ${moisNoms[month - 1]} ${year}`;
}

export function formatDeadlineLabel(period: string): string {
  const { year, month } = periodToYearMonth(period);
  const moisNoms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${DEADLINE_DAY} ${moisNoms[month - 1]} ${year} à ${DEADLINE_HOUR}h00`;
}

/** Jour de la semaine (tel qu'écrit dans Course.jour) -> index JS (0 = dimanche). */
export const JOUR_VERS_INDEX: Record<string, number> = {
  Dimanche: 0,
  Lundi: 1,
  Mardi: 2,
  Mercredi: 3,
  Jeudi: 4,
  Vendredi: 5,
  Samedi: 6,
};

/**
 * Renvoie les dates (format "YYYY-MM-DD") de toutes les occurrences d'un
 * jour de la semaine entre le 1er et le DEADLINE_DAY (20) du mois d'une
 * période "YYYY-MM" — c'est le calendrier prévisionnel du décompte par
 * cours pour la paie (l'école compte en cours, pas en heures : voir
 * project/contexte/regles-metier.md). Un cours sans jour fixe (ex. "packs"
 * Etudes/SAE) renvoie un tableau vide — à signaler à part par l'appelant
 * plutôt que silencieusement ignoré.
 */
export function occurrenceDatesInPeriod(jour: string | null | undefined, period: string): string[] {
  if (!jour) return [];
  const jourIndex = JOUR_VERS_INDEX[jour];
  if (jourIndex === undefined) return [];

  const { year, month } = periodToYearMonth(period);
  const dates: string[] = [];
  for (let jourDuMois = 1; jourDuMois <= DEADLINE_DAY; jourDuMois++) {
    const candidat = new Date(year, month - 1, jourDuMois);
    if (candidat.getDay() !== jourIndex) continue;
    const y = candidat.getFullYear();
    const m = String(candidat.getMonth() + 1).padStart(2, "0");
    const d = String(candidat.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

/** Compte le nombre d'occurrences — voir {@link occurrenceDatesInPeriod}. */
export function countWeekdayOccurrencesInPeriod(jour: string | null | undefined, period: string): number {
  return occurrenceDatesInPeriod(jour, period).length;
}
