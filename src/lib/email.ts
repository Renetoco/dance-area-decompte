import nodemailer from "nodemailer";
import { formatDeadlineLabel, formatPeriodLabel, formatLateWindowEndLabel } from "./dates";

/** Échappe les caractères HTML spéciaux avant interpolation dans un email
 * (SECURITY-REVIEW.md #7) — teacherName vient de la base (modifiable par un
 * admin), on évite qu'un caractère < ou & y casse le rendu ou injecte du
 * balisage dans le client mail du destinataire. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envoi via le relais SMTP d'Infomaniak. Voir DEPLOIEMENT.md pour la
 * marche à suivre exacte (créer l'adresse d'envoi, récupérer le mot de
 * passe SMTP, renseigner les variables d'environnement).
 */
function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "mail.infomaniak.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

const FROM = process.env.MAIL_FROM || "Dance Area — Décomptes <no-reply@dancearea.ch>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
) {
  const transport = getTransport();
  await transport.sendMail({ from: FROM, to, subject, html, text, attachments });
}

function wrapHtml(bodyHtml: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
    <h2 style="color:#111;">Dance Area — Décompte mensuel</h2>
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 12px; color: #888;">
      Dance Area, Rue de la Coulouvrenière 19, 1204 Genève
    </p>
  </div>`;
}

export async function sendReminderEmail(opts: {
  to: string;
  teacherName: string;
  period: string;
  daysLeft: number; // 4 (rappel J-4) ou 0 (dernier rappel, le matin de la deadline)
  isAjbTeacher?: boolean; // donne aussi des cours AJB — voir Teacher.ajbTeacher
}) {
  const { to, teacherName, period, daysLeft, isAjbTeacher } = opts;
  const link = `${APP_URL}/prof`;
  const isLastCall = daysLeft === 0;

  // Paragraphe spécifique aux profs qui donnent des cours AJB (Area Jeune
  // Ballet) — demande de Rene du 18.09.2026 : ces cours ne sont plus
  // comptés automatiquement (trop de changements/remplacements), donc sans
  // ce champ rempli, aucun cours AJB n'apparaît sur la fiche de salaire.
  const ajbHtml = isAjbTeacher
    ? `<p>Petite précision pour vos cours <strong>Area Jeune Ballet (AJB)</strong> : en raison des changements
       fréquents de jours, d'horaires et de profs au sein d'AJB, ces cours ne peuvent plus être comptés
       automatiquement. Pensez donc impérativement à indiquer, dans votre décompte, le nombre de cours AJB
       donnés pendant la période — c'est cette information qui permet à la comptabilité d'établir une fiche
       de salaire juste. Sans rien d'indiqué, aucun cours AJB ne sera compté ce mois-ci.</p>
       <p>Si un changement AJB survient après la date limite (entre le 20 et le ${formatLateWindowEndLabel(period)}),
       vous pourrez encore le signaler sur la plateforme via l'option « changement AJB tardif » : la comptabilité
       sera automatiquement prévenue et décidera si ce cours est pris en compte sur le salaire de ce mois-ci ou du
       suivant.</p>`
    : "";
  const ajbText = isAjbTeacher
    ? `\n\nPetite précision pour vos cours Area Jeune Ballet (AJB) : en raison des changements fréquents de jours, d'horaires et de profs au sein d'AJB, ces cours ne peuvent plus être comptés automatiquement. Pensez donc impérativement à indiquer, dans votre décompte, le nombre de cours AJB donnés pendant la période. Sans rien d'indiqué, aucun cours AJB ne sera compté ce mois-ci. Un changement AJB après la date limite peut encore être signalé via l'option "changement AJB tardif" sur la plateforme.`
    : "";

  const subject = isLastCall
    ? `Dernier jour : décompte à soumettre avant ${formatDeadlineLabel(period)}`
    : `Rappel : décompte à soumettre avant le ${formatDeadlineLabel(period)}`;

  const introHtml = isLastCall
    ? `<p>C'est aujourd'hui : vous avez jusqu'à <strong>${formatDeadlineLabel(period)}</strong> pour
       soumettre votre décompte pour la période du ${formatPeriodLabel(period)}.</p>`
    : `<p>Il reste <strong>${daysLeft} jours</strong> pour soumettre votre décompte pour la
       période du ${formatPeriodLabel(period)}.</p>`;
  const introText = isLastCall
    ? `C'est aujourd'hui : vous avez jusqu'à ${formatDeadlineLabel(period)} pour soumettre votre décompte pour la période du ${formatPeriodLabel(period)}.`
    : `Il reste ${daysLeft} jours pour soumettre votre décompte pour la période du ${formatPeriodLabel(period)}.`;

  const closingHtml = isLastCall
    ? `<p>Passé cette heure, votre décompte sera envoyé automatiquement avec ce que vous aurez
       déjà saisi (ou « aucun changement » si rien n'a été rempli).</p>`
    : `<p>Ces rappels sont automatiques : si vous préférez ne plus le recevoir, il suffit
       d'envoyer votre décompte dès maintenant, même sans changement. Sinon, un dernier rappel
       vous parviendra le matin du jour de la deadline, simplement pour éviter un oubli.</p>`;
  const closingText = isLastCall
    ? `Passé cette heure, votre décompte sera envoyé automatiquement avec ce que vous aurez déjà saisi (ou "aucun changement" si rien n'a été rempli).`
    : `Ces rappels sont automatiques : si vous préférez ne plus le recevoir, il suffit d'envoyer votre décompte dès maintenant, même sans changement. Sinon, un dernier rappel vous parviendra le matin du jour de la deadline, simplement pour éviter un oubli.`;

  const html = wrapHtml(`
    <p>Bonjour ${escapeHtml(teacherName)},</p>
    ${introHtml}
    <p>Peut-être que ce mois-ci, rien n'a changé sur votre planning : dans ce
    cas, un clic sur « Non, rien n'a changé » suffit. Vous pouvez aussi ne
    rien faire du tout — votre décompte sera envoyé automatiquement à la
    date limite, avec ce que vous aurez déjà saisi (ou « aucun changement »
    si rien n'a été rempli).</p>
    ${ajbHtml}
    <p style="margin: 24px 0;">
      <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;
      border-radius:6px;text-decoration:none;">Accéder à mon décompte</a>
    </p>
    ${closingHtml}
    <p>Merci pour votre engagement auprès des élèves, et à très bientôt !<br/>
    L'équipe Dance Area</p>
  `);
  const text = `Bonjour ${teacherName},\n\n${introText}\n\nPeut-être que ce mois-ci, rien n'a changé sur votre planning : dans ce cas, un clic sur « Non, rien n'a changé » suffit. Vous pouvez aussi ne rien faire du tout — votre décompte sera envoyé automatiquement à la date limite, avec ce que vous aurez déjà saisi (ou « aucun changement » si rien n'a été rempli).${ajbText}\n\nAccédez à votre décompte : ${link}\n\n${closingText}\n\nMerci pour votre engagement auprès des élèves, et à très bientôt !\nL'équipe Dance Area`;
  await send(to, subject, html, text);
}

/**
 * Résumé QUOTIDIEN (et non plus immédiat par entrée) des changements et
 * cours AJB signalés tardivement (entre la deadline du 20 et la fin de la
 * période le 26) — un seul email groupant tout ce qui est arrivé dans la
 * journée, envoyé uniquement s'il y a effectivement eu au moins une entrée
 * ce jour-là. Remplace les alertes immédiates par entrée (une par une)
 * qui existaient auparavant — demande de Rene du 21.09.2026, pour réduire
 * le volume d'emails reçus par la comptabilité et la direction.
 */
export async function sendLateEntriesDailyDigest(opts: {
  to: string[];
  period: string;
  dateLabel: string;
  items: { teacherName: string; typeLabel: string; courseLabel: string | null; date: string | null; comment: string | null }[];
  ajbEntries: { teacherName: string; nomCours: string; date: string | null; heure: string | null; comment: string | null }[];
}) {
  const { to, period, dateLabel, items, ajbEntries } = opts;
  if (to.length === 0) return;
  const total = items.length + ajbEntries.length;
  if (total === 0) return;

  const subject = `Entrées tardives du ${dateLabel} — décompte ${formatPeriodLabel(period)} (${total})`;

  const itemLine = (i: (typeof items)[number]) =>
    [i.teacherName, i.typeLabel, i.courseLabel, i.date].filter(Boolean).join(" — ") +
    (i.comment ? ` (${i.comment})` : "");
  const ajbLine = (e: (typeof ajbEntries)[number]) =>
    [e.teacherName, "Cours AJB", e.nomCours, e.date, e.heure].filter(Boolean).join(" — ") +
    (e.comment ? ` (${e.comment})` : "");

  const html = wrapHtml(`
    <p>Bonjour,</p>
    <p>${total} entrée(s) tardive(s) ont été signalée(s) le ${escapeHtml(dateLabel)} sur le décompte
    ${formatPeriodLabel(period)} (après la date limite du 20, dans la fenêtre encore ouverte jusqu'au 26).
    Les déclarations déjà soumises restent inchangées ; ces lignes s'y ajoutent, marquées « tardives ».</p>
    ${items.length > 0 ? `<ul>${items.map((i) => `<li>${escapeHtml(itemLine(i))}</li>`).join("")}</ul>` : ""}
    ${ajbEntries.length > 0 ? `<ul>${ajbEntries.map((e) => `<li>${escapeHtml(ajbLine(e))}</li>`).join("")}</ul>` : ""}
    <p>À vous de décider si ces changements sont pris en compte sur le salaire de ce mois-ci ou
    reportés sur le mois suivant — ils sont repérables dans l'export Excel.</p>
  `);
  const text = `${total} entrée(s) tardive(s) signalée(s) le ${dateLabel} sur le décompte ${formatPeriodLabel(period)} (après la date limite du 20, fenêtre ouverte jusqu'au 26).\n\n${[...items.map(itemLine), ...ajbEntries.map(ajbLine)].map((l) => `- ${l}`).join("\n")}\n\nÀ vous de décider si ces changements sont pris en compte sur le salaire de ce mois-ci ou reportés sur le mois suivant — ils sont repérables dans l'export Excel.`;
  await send(to.join(", "), subject, html, text);
}

/**
 * Mail de clôture (le 20, juste après le verrouillage/l'auto-soumission) à
 * Admin + Comptabilité + Direction — demande de Rene du 18.09.2026 : le
 * fichier Excel du cycle en pièce jointe, plus un résumé rapide dans le
 * corps pour ne pas avoir à l'ouvrir tout de suite.
 */
export async function sendClosureSummaryEmail(opts: {
  to: string[];
  period: string;
  xlsxBuffer: Buffer;
  stats: {
    totalDeclarations: number;
    autoSubmittedCount: number;
    manualSubmittedCount: number;
    teachersWithChangesCount: number;
    teachersWithChangesNames: string[];
    ajbFilledNames: string[];
    ajbMissingNames: string[];
  };
  // "verrouillage" (le 20, comme avant) | "final" (le 26, à la comptabilité,
  // une fois la fenêtre tardive terminée — inclut donc les entrées tardives
  // arrivées entre-temps) | "secretariat" (le 30, récap allégé) — demande
  // de Rene du 21.09.2026. Le contenu (stats + Excel) est identique dans
  // les 3 cas, seul le sujet/l'intro change pour rester clair sur le
  // moment et le destinataire.
  kind?: "verrouillage" | "final" | "secretariat";
}) {
  const { to, period, xlsxBuffer, stats, kind = "verrouillage" } = opts;
  if (to.length === 0) return;

  const periodeLabel = formatPeriodLabel(period);
  const SUBJECTS: Record<string, string> = {
    verrouillage: `Clôture du décompte ${periodeLabel} — résumé et export Excel`,
    final: `Résumé final du décompte ${periodeLabel} (après la fenêtre tardive) — export Excel`,
    secretariat: `Récapitulatif du décompte ${periodeLabel} — export Excel`,
  };
  const INTROS: Record<string, string> = {
    verrouillage: `La date limite du décompte de <strong>${periodeLabel}</strong> vient de passer. Voici un résumé rapide, et le fichier Excel complet est joint à ce mail.`,
    final: `La fenêtre de saisie tardive du décompte de <strong>${periodeLabel}</strong> vient de se terminer (le 26). Voici le résumé final, entrées tardives incluses, et le fichier Excel complet est joint à ce mail.`,
    secretariat: `Voici le récapitulatif du décompte de <strong>${periodeLabel}</strong>, avec le fichier Excel complet en pièce jointe.`,
  };
  const subject = SUBJECTS[kind];

  const listHtml = (names: string[]) =>
    names.length > 0 ? `<ul>${names.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : "<p><em>Aucun·e.</em></p>";

  const html = wrapHtml(`
    <p>Bonjour,</p>
    <p>${INTROS[kind]}</p>
    <ul>
      <li>${stats.totalDeclarations} déclaration(s) au total</li>
      <li>${stats.manualSubmittedCount} envoyée(s) manuellement par les profs</li>
      <li>${stats.autoSubmittedCount} envoyée(s) automatiquement (deadline dépassée sans action du prof)</li>
      <li>${stats.teachersWithChangesCount} prof(s) ont déclaré des changements</li>
    </ul>
    <p><strong>Profs ayant déclaré des changements :</strong></p>
    ${listHtml(stats.teachersWithChangesNames)}
    <p><strong>Cours AJB — profs ayant rempli leur champ :</strong></p>
    ${listHtml(stats.ajbFilledNames)}
    <p><strong>Cours AJB — profs n'ayant rien rempli (0 cours AJB pris en compte pour eux ce mois-ci) :</strong></p>
    ${listHtml(stats.ajbMissingNames)}
  `);

  const TEXT_INTROS: Record<string, string> = {
    verrouillage: `Clôture du décompte ${periodeLabel}.`,
    final: `Résumé final du décompte ${periodeLabel} (après la fenêtre tardive).`,
    secretariat: `Récapitulatif du décompte ${periodeLabel}.`,
  };
  const text = `${TEXT_INTROS[kind]}\n\n${stats.totalDeclarations} déclaration(s) au total\n${stats.manualSubmittedCount} envoyée(s) manuellement\n${stats.autoSubmittedCount} envoyée(s) automatiquement\n${stats.teachersWithChangesCount} prof(s) ont déclaré des changements\n\nProfs ayant déclaré des changements :\n${stats.teachersWithChangesNames.map((n) => `- ${n}`).join("\n") || "(aucun·e)"}\n\nCours AJB — rempli :\n${stats.ajbFilledNames.map((n) => `- ${n}`).join("\n") || "(aucun·e)"}\n\nCours AJB — non rempli :\n${stats.ajbMissingNames.map((n) => `- ${n}`).join("\n") || "(aucun·e)"}`;

  await send(to.join(", "), subject, html, text, [
    {
      filename: `decompte-dance-area-${period}.xlsx`,
      content: xlsxBuffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ]);
}

export async function sendAutoSubmitNotice(opts: {
  to: string;
  teacherName: string;
  period: string;
  hadChanges: boolean;
}) {
  const { to, teacherName, period, hadChanges } = opts;
  const subject = `Votre décompte de ${formatPeriodLabel(period)} a été soumis automatiquement`;
  const html = wrapHtml(`
    <p>Bonjour ${escapeHtml(teacherName)},</p>
    <p>La date limite du ${formatDeadlineLabel(period)} est passée sans
    soumission manuelle de votre part. Votre décompte a donc été soumis
    automatiquement
    ${hadChanges ? "avec les informations que vous aviez déjà saisies." : "avec la mention \"aucun changement\"."}</p>
    <p>Si une information est incorrecte, contactez l'administration de
    Dance Area au plus vite pour une correction.</p>
  `);
  const text = `Bonjour ${teacherName},\n\nVotre décompte de ${formatPeriodLabel(period)} a été soumis automatiquement (date limite du ${formatDeadlineLabel(period)} dépassée). Contactez l'administration si une correction est nécessaire.`;
  await send(to, subject, html, text);
}

export async function sendWelcomeEmail(opts: {
  to: string;
  teacherName: string;
  tempPassword: string;
}) {
  const { to, teacherName, tempPassword } = opts;
  const link = `${APP_URL}/connexion`;
  const subject = "Votre accès au décompte mensuel Dance Area";
  const html = wrapHtml(`
    <p>Bonjour ${escapeHtml(teacherName)},</p>
    <p>Un compte a été créé pour vous sur la plateforme de décompte mensuel
    de Dance Area.</p>
    <p>Identifiant : <strong>${to}</strong><br/>
    Mot de passe temporaire : <strong>${tempPassword}</strong></p>
    <p>Il vous sera demandé de le changer à la première connexion.</p>
    <p style="margin: 24px 0;">
      <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;
      border-radius:6px;text-decoration:none;">Se connecter</a>
    </p>
  `);
  const text = `Bonjour ${teacherName},\n\nUn compte a été créé pour vous : ${to} / mot de passe temporaire : ${tempPassword}\nConnexion : ${link}`;
  await send(to, subject, html, text);
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  teacherName: string;
  tempPassword: string;
}) {
  const { to, teacherName, tempPassword } = opts;
  const link = `${APP_URL}/connexion`;
  const subject = "Réinitialisation de votre mot de passe — Dance Area";
  const html = wrapHtml(`
    <p>Bonjour ${escapeHtml(teacherName)},</p>
    <p>Voici votre nouveau mot de passe temporaire : <strong>${tempPassword}</strong></p>
    <p>Il vous sera demandé de le changer à la prochaine connexion.</p>
    <p style="margin: 24px 0;">
      <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;
      border-radius:6px;text-decoration:none;">Se connecter</a>
    </p>
  `);
  const text = `Bonjour ${teacherName},\n\nNouveau mot de passe temporaire : ${tempPassword}\nConnexion : ${link}`;
  await send(to, subject, html, text);
}
