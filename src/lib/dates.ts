/**
 * Toute la logique de dates du cycle mensuel vit ici — voir
 * project/contexte/regles-metier.md pour la règle en langage naturel :
 *   - période de paie : du 27 du mois précédent au 26 du mois de la
 *     période (ex. la période "2026-09" couvre le 27 août au 26
 *     septembre 2026) — précision de la comptabilité du 17.09.2026,
 *     remplace l'ancienne fenêtre "1er-20" qui ne couvrait qu'une partie
 *     de la vraie période de paie.
 *   - deadline de soumission : le 20 (du mois de la période) à 21h00,
 *     heure de Genève (Europe/Zurich) — à l'intérieur de la période, pour
 *     laisser le temps de traiter la paie avant sa fin le 26.
 *   - les profs peuvent donc déclarer par anticipation des changements
 *     prévus entre le 20 et le 26 (avant la deadline), et signaler des
 *     changements tardifs sur ce même créneau après la deadline (voir
 *     `isWithinLateWindow` et le champ `DeclarationItem.tardif`).
 *   - rappels : J-4 et le matin du jour de la deadline (J-0), à 09h00.
 *
 * On n'utilise aucune librairie de dates externe : Node embarque une base
 * de fuseaux horaires complète (Intl), ce qui suffit pour ce besoin.
 */

export const TIMEZONE = "Europe/Zurich";
export const PERIOD_START_DAY = 27; // début de la période : le 27 du mois précédent
export const PERIOD_END_DAY = 26; // fin de la période : le 26 du mois de la période
export const DEADLINE_DAY = 20;
export const DEADLINE_HOUR = 21;
export const REMINDER_OFFSETS_DAYS = [4, 0] as const; // J-4 et le matin du jour J (deadline)
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

/** Ajoute (ou retire) des mois à une paire année/mois, en gérant le passage d'année. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = (month - 1) + delta;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12 + 1;
  return { year: y, month: m };
}

/**
 * Période au format "2026-09", calculée sur la date du jour à Genève.
 * La période "2026-09" couvre le 27 août au 26 septembre 2026 : à partir
 * du 27 du mois, on est donc déjà entré dans la période du mois suivant.
 */
export function currentPeriod(now: Date = new Date()): string {
  const { year, month, day } = getZonedParts(now);
  const { year: y, month: m } = day >= PERIOD_START_DAY ? addMonths(year, month, 1) : { year, month };
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function periodToYearMonth(period: string): { year: number; month: number } {
  const [y, m] = period.split("-").map(Number);
  return { year: y, month: m };
}

/** Bornes calendaires (incluses) de la période "YYYY-MM" : le 27 du mois précédent au 26 du mois de la période. */
export function periodBounds(period: string): {
  start: { year: number; month: number; day: number };
  end: { year: number; month: number; day: number };
} {
  const { year, month } = periodToYearMonth(period);
  const prev = addMonths(year, month, -1);
  return {
    start: { year: prev.year, month: prev.month, day: PERIOD_START_DAY },
    end: { year, month, day: PERIOD_END_DAY },
  };
}

/** Instant (UTC) de la deadline pour une période "YYYY-MM". */
export function getDeadline(period: string): Date {
  const { year, month } = periodToYearMonth(period);
  return zonedTimeToUtc(year, month, DEADLINE_DAY, DEADLINE_HOUR, 0);
}

/** Instant (UTC) de fin de la fenêtre de saisie tardive : fin du 26 (23h59), heure de Genève. */
export function getLateWindowEnd(period: string): Date {
  const { end } = periodBounds(period);
  return zonedTimeToUtc(end.year, end.month, end.day, 23, 59);
}

/** Instants (UTC) des rappels (J-4 et le matin du jour de la deadline) pour une période. */
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

/**
 * Fenêtre de saisie tardive : après la deadline (20 à 21h) et jusqu'à la
 * fin de la période (26 à 23h59). Un changement saisi dans cette fenêtre
 * est marqué "tardif" (voir `DeclarationItem.tardif`) et déclenche une
 * alerte par email à la comptabilité/direction, sans rouvrir la
 * déclaration déjà soumise.
 */
export function isWithinLateWindow(period: string, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= getDeadline(period).getTime() && t <= getLateWindowEnd(period).getTime();
}

/** Libellé humain de la période, ex. "27 août - 26 septembre 2026". */
export function formatPeriodLabel(period: string): string {
  const { start, end } = periodBounds(period);
  const moisNoms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const startLabel =
    start.year !== end.year
      ? `${start.day} ${moisNoms[start.month - 1]} ${start.year}`
      : `${start.day} ${moisNoms[start.month - 1]}`;
  const endLabel = `${end.day} ${moisNoms[end.month - 1]} ${end.year}`;
  return `${startLabel} - ${endLabel}`;
}

export function formatDeadlineLabel(period: string): string {
  const { year, month } = periodToYearMonth(period);
  const moisNoms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${DEADLINE_DAY} ${moisNoms[month - 1]} ${year} à ${DEADLINE_HOUR}h00`;
}

/** Libellé humain de la fin de la fenêtre tardive, ex. "26 septembre 2026". */
export function formatLateWindowEndLabel(period: string): string {
  const { end } = periodBounds(period);
  const moisNoms = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  return `${end.day} ${moisNoms[end.month - 1]} ${end.year}`;
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
 * jour de la semaine sur toute la période "YYYY-MM" (27 du mois précédent
 * au 26 du mois de la période) — c'est le calendrier prévisionnel du
 * décompte par cours pour la paie (l'école compte en cours, pas en
 * heures : voir project/contexte/regles-metier.md). Un cours sans jour
 * fixe (ex. "packs" Etudes/SAE) renvoie un tableau vide — à signaler à
 * part par l'appelant plutôt que silencieusement ignoré.
 */
export function occurrenceDatesInPeriod(jour: string | null | undefined, period: string): string[] {
  if (!jour) return [];
  const jourIndex = JOUR_VERS_INDEX[jour];
  if (jourIndex === undefined) return [];

  const { start, end } = periodBounds(period);
  const startDate = new Date(start.year, start.month - 1, start.day);
  const endDate = new Date(end.year, end.month - 1, end.day);

  const dates: string[] = [];
  for (const d = startDate; d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== jourIndex) continue;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

/** Compte le nombre d'occurrences — voir {@link occurrenceDatesInPeriod}. */
export function countWeekdayOccurrencesInPeriod(jour: string | null | undefined, period: string): number {
  return occurrenceDatesInPeriod(jour, period).length;
}
