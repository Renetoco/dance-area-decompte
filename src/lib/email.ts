import nodemailer from "nodemailer";
import { formatDeadlineLabel, formatPeriodLabel } from "./dates";

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

const FROM = process.env.MAIL_FROM || "Dance Area — Décomptes <rene.torres@dancearea.ch>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function send(to: string, subject: string, html: string, text: string) {
  const transport = getTransport();
  await transport.sendMail({ from: FROM, to, subject, html, text });
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
}) {
  const { to, teacherName, period, daysLeft } = opts;
  const link = `${APP_URL}/prof`;
  const isLastCall = daysLeft === 0;

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
    <p style="margin: 24px 0;">
      <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;
      border-radius:6px;text-decoration:none;">Accéder à mon décompte</a>
    </p>
    ${closingHtml}
    <p>Merci pour votre engagement auprès des élèves, et à très bientôt !<br/>
    L'équipe Dance Area</p>
  `);
  const text = `Bonjour ${teacherName},\n\n${introText}\n\nPeut-être que ce mois-ci, rien n'a changé sur votre planning : dans ce cas, un clic sur « Non, rien n'a changé » suffit. Vous pouvez aussi ne rien faire du tout — votre décompte sera envoyé automatiquement à la date limite, avec ce que vous aurez déjà saisi (ou « aucun changement » si rien n'a été rempli).\n\nAccédez à votre décompte : ${link}\n\n${closingText}\n\nMerci pour votre engagement auprès des élèves, et à très bientôt !\nL'équipe Dance Area`;
  await send(to, subject, html, text);
}

export async function sendLateEntryAlert(opts: {
  to: string[];
  teacherName: string;
  period: string;
  item: { typeLabel: string; courseLabel: string | null; date: string | null; comment: string | null };
}) {
  const { to, teacherName, period, item } = opts;
  if (to.length === 0) return;

  const subject = `Changement tardif signalé — ${teacherName} (${formatPeriodLabel(period)})`;
  const detailLine = [item.typeLabel, item.courseLabel, item.date]
    .filter((v): v is string => Boolean(v))
    .map((v) => escapeHtml(v))
    .join(" — ");
  const detailLineText = [item.typeLabel, item.courseLabel, item.date].filter(Boolean).join(" — ");

  const html = wrapHtml(`
    <p>Bonjour,</p>
    <p><strong>${escapeHtml(teacherName)}</strong> a signalé un changement après la date limite du
    décompte de ${formatPeriodLabel(period)}. Sa déclaration avait déjà été envoyée et reste
    inchangée ; cette ligne s'y ajoute, marquée « tardive ».</p>
    <p>${detailLine}</p>
    ${item.comment ? `<p>Commentaire : ${escapeHtml(item.comment)}</p>` : ""}
    <p>À vous de décider si ce changement est pris en compte sur le salaire de ce mois-ci ou
    reporté sur le mois suivant — il est repérable dans l'export Excel.</p>
  `);
  const text = `${teacherName} a signalé un changement après la date limite du décompte de ${formatPeriodLabel(period)}. Sa déclaration avait déjà été envoyée et reste inchangée ; cette ligne s'y ajoute, marquée "tardive".\n\n${detailLineText}\n${item.comment ? `Commentaire : ${item.comment}\n` : ""}\nÀ vous de décider si ce changement est pris en compte sur le salaire de ce mois-ci ou reporté sur le mois suivant — il est repérable dans l'export Excel.`;
  await send(to.join(", "), subject, html, text);
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
