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
  daysLeft: number;
}) {
  const { to, teacherName, period, daysLeft } = opts;
  const link = `${APP_URL}/prof`;
  const subject = `Rappel : décompte à soumettre avant le ${formatDeadlineLabel(period)}`;
  const html = wrapHtml(`
    <p>Bonjour ${escapeHtml(teacherName)},</p>
    <p>Il reste <strong>${daysLeft} jour${daysLeft > 1 ? "s" : ""}</strong> pour soumettre
    votre décompte pour la période du ${formatPeriodLabel(period)}.</p>
    <p>Si rien n'a changé sur votre planning, ça prend 10 secondes :
    un seul bouton à cliquer.</p>
    <p style="margin: 24px 0;">
      <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;
      border-radius:6px;text-decoration:none;">Accéder à mon décompte</a>
    </p>
    <p>Passé le ${formatDeadlineLabel(period)}, votre décompte sera soumis
    automatiquement avec les informations déjà saisies (ou "aucun
    changement" si rien n'a été rempli).</p>
  `);
  const text = `Bonjour ${teacherName},\n\nIl reste ${daysLeft} jour(s) pour soumettre votre décompte pour la période du ${formatPeriodLabel(period)}.\nAccédez à votre décompte : ${link}\n\nPassé le ${formatDeadlineLabel(period)}, votre décompte sera soumis automatiquement.`;
  await send(to, subject, html, text);
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
    <p>La deadline du ${formatDeadlineLabel(period)} est passée sans soumission
    manuelle de votre part. Votre décompte a donc été soumis automatiquement
    ${hadChanges ? "avec les informations que vous aviez déjà saisies." : "avec la mention \"aucun changement\"."}</p>
    <p>Si une information est incorrecte, contactez l'administration de
    Dance Area au plus vite pour une correction.</p>
  `);
  const text = `Bonjour ${teacherName},\n\nVotre décompte de ${formatPeriodLabel(period)} a été soumis automatiquement (deadline du ${formatDeadlineLabel(period)} dépassée). Contactez l'administration si une correction est nécessaire.`;
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
