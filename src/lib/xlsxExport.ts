import ExcelJS from "exceljs";
import { formatPeriodLabel } from "./dates";
import { computePayrollForPeriod, PayrollAdjustment, PayrollTeacherRow } from "./payroll";
import { DeclarationStatus } from "@prisma/client";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué (a couvert un·e collègue)",
  ABSENCE_REMPLACEE: "Absence remplacée (a été remplacé·e)",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  [DeclarationStatus.DRAFT]: "Non soumis",
  [DeclarationStatus.SUBMITTED_MANUAL]: "Soumis manuellement",
  [DeclarationStatus.SUBMITTED_AUTO]: "Soumis automatiquement (deadline dépassée)",
};

const ROLE_LABELS: Record<string, string> = {
  ENSEIGNANT: "Enseignant·e",
  MUSICIEN: "Musicien·ne",
};

const HEADER_FONT = { bold: true };

/** Nom d'onglet Excel valide : 31 caractères max, sans \ / ? * [ ] : — et unique dans le classeur. */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Prof";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Génère le classeur Excel du cycle — décompte par cours (et non par
 * heures), à la demande de la comptabilité. Onglets :
 *   - "Résumé" : une ligne par prof, avec le total de cours du mois (base +
 *     ajustements déclarés), pour un import direct en paie.
 *   - "À vérifier" : toutes profs confondus, les lignes qui ont un
 *     commentaire et/ou citent un·e remplaçant·e hors de la liste des
 *     profs actifs — pour un contrôle manuel rapide avant la paie.
 *   - un onglet par prof : calendrier prévisionnel détaillé (une ligne par
 *     séance prévue du mois, modifiée ou non), plus les changements qui ne
 *     correspondent à aucune séance de son propre planning.
 *
 * Si `teacherIds` est fourni, seuls ces profs sont inclus (export d'une
 * sélection) — sinon tous les profs actifs (export complet).
 *
 * Toutes les valeurs libres saisies par les profs (commentaire, nom de
 * remplaçant·e en texte libre) sont écrites comme simples valeurs de
 * cellule "string" — jamais comme formule — donc pas de risque d'injection
 * de formule Excel (contrairement à un export CSV brut, voir
 * SECURITY-REVIEW.md #4, qui ne s'applique pas ici).
 */
export async function generateXlsxForPeriod(period: string, teacherIds?: string[]): Promise<ExcelJS.Buffer> {
  const rows = await computePayrollForPeriod(period, teacherIds);

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.title = `Décompte Dance Area — ${formatPeriodLabel(period)}`;

  buildResumeSheet(workbook, rows);
  buildAVerifierSheet(workbook, rows, period);

  const usedNames = new Set<string>();
  for (const r of rows) {
    buildTeacherSheet(workbook, r, period, safeSheetName(r.teacherName, usedNames));
  }

  return (await workbook.xlsx.writeBuffer()) as ExcelJS.Buffer;
}

function buildResumeSheet(workbook: ExcelJS.Workbook, rows: PayrollTeacherRow[]) {
  const resume = workbook.addWorksheet("Résumé");
  resume.columns = [
    { header: "Code analytique", key: "code", width: 14 },
    { header: "Nom du prof", key: "nom", width: 28 },
    { header: "Rôle", key: "role", width: 14 },
    { header: "Cours prévus (base)", key: "prevus", width: 18 },
    { header: "Ajustements déclarés", key: "ajustements", width: 18 },
    { header: "Total cours du mois", key: "total", width: 18 },
    { header: "Cours sans jour fixe (à vérifier manuellement)", key: "sansJour", width: 34 },
    { header: "Lignes à vérifier", key: "aVerifier", width: 16 },
    { header: "Décompte modifié ?", key: "modifie", width: 20 },
    { header: "Entrées tardives", key: "tardif", width: 16 },
    { header: "Statut de la déclaration", key: "statut", width: 28 },
  ];
  resume.getRow(1).font = HEADER_FONT;
  resume.autoFilter = { from: "A1", to: "K1" };

  for (const r of rows) {
    resume.addRow({
      code: r.analyticCode,
      nom: r.teacherName,
      role: ROLE_LABELS[r.role] ?? r.role,
      prevus: r.coursesPrevus,
      ajustements: r.totalAjustementsCours,
      total: r.totalFinal,
      sansJour: r.coursesSansJourFixe || "",
      aVerifier: r.aVerifierCount || "",
      // "Oui" = déclaration avec changements saisis ; "Non" = envoyée
      // (manuellement ou automatiquement) sans aucune modification ; "—" =
      // pas encore de déclaration pour ce mois-ci — demande de Rene du
      // 16.09.2026, pour distinguer d'un coup d'œil ce qui a vraiment été
      // modifié de ce qui a été envoyé tel quel.
      modifie: r.hasChanges === true ? "Oui" : r.hasChanges === false ? "Non" : "—",
      tardif: r.tardifCount || "",
      statut: r.declarationStatus ? STATUS_LABELS[r.declarationStatus] ?? r.declarationStatus : "Aucune déclaration",
    });
  }
}

function buildAVerifierSheet(workbook: ExcelJS.Workbook, rows: PayrollTeacherRow[], period: string) {
  const sheet = workbook.addWorksheet("À vérifier");
  sheet.columns = [
    { header: "Code analytique", key: "code", width: 14 },
    { header: "Nom du prof", key: "nom", width: 28 },
    { header: "Période", key: "periode", width: 20 },
    { header: "Type de changement", key: "type", width: 34 },
    { header: "Cours concerné", key: "cours", width: 32 },
    { header: "Date de l'occurrence", key: "date", width: 16 },
    { header: "Impact sur le total", key: "impact", width: 16 },
    { header: "Tardif ?", key: "tardif", width: 12 },
    { header: "Autre prof concerné", key: "autreProf", width: 26 },
    { header: "Commentaire", key: "commentaire", width: 40 },
  ];
  sheet.getRow(1).font = HEADER_FONT;
  sheet.autoFilter = { from: "A1", to: "J1" };

  const periodeLabel = formatPeriodLabel(period);
  let count = 0;
  for (const r of rows) {
    const all: PayrollAdjustment[] = [
      ...r.occurrences.filter((o) => o.adjustment).map((o) => o.adjustment as PayrollAdjustment),
      ...r.extraAdjustments,
    ];
    for (const a of all) {
      if (!a.aVerifier) continue;
      count++;
      sheet.addRow({
        code: r.analyticCode,
        nom: r.teacherName,
        periode: periodeLabel,
        type: CHANGE_TYPE_LABELS[a.type] ?? a.type,
        cours: a.courseLabel ?? "",
        date: a.date ?? "",
        impact: a.delta,
        tardif: a.tardif ? "Oui" : "",
        autreProf: a.autreProf ?? "",
        commentaire: a.comment ?? "",
      });
    }
  }
  if (count === 0) {
    sheet.addRow(["", "", "", "Aucune ligne à vérifier ce mois-ci.", "", "", "", "", "", ""]);
  }
}

const TEACHER_SHEET_WIDTHS = [14, 12, 32, 20, 34, 10, 12, 12, 26, 40];
const TEACHER_SHEET_HEADERS = [
  "Date",
  "Jour",
  "Cours",
  "Statut de la séance",
  "Type de changement",
  "Impact",
  "À vérifier",
  "Tardif",
  "Autre prof concerné",
  "Commentaire",
];

function buildTeacherSheet(workbook: ExcelJS.Workbook, r: PayrollTeacherRow, period: string, sheetName: string) {
  const sheet = workbook.addWorksheet(sheetName);
  TEACHER_SHEET_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // --- En-tête d'identification du prof (lignes 1-3, avant le tableau) ---
  const titleRow = sheet.addRow([`${r.teacherName} (${r.analyticCode}) — ${ROLE_LABELS[r.role] ?? r.role}`]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, 10);
  titleRow.font = { bold: true, size: 13 };

  const subtitleRow = sheet.addRow([
    `Période : ${formatPeriodLabel(period)} — Statut : ${
      r.declarationStatus ? STATUS_LABELS[r.declarationStatus] ?? r.declarationStatus : "Aucune déclaration"
    }`,
  ]);
  sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, 10);
  subtitleRow.font = { italic: true, color: { argb: "FF555555" } };

  sheet.addRow([]);

  const headerRow = sheet.addRow(TEACHER_SHEET_HEADERS);
  headerRow.font = HEADER_FONT;
  sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: headerRow.number, column: 10 } };

  // --- Calendrier prévisionnel : une ligne par séance attendue du mois ---
  for (const occ of r.occurrences) {
    const a = occ.adjustment;
    sheet.addRow([
      occ.date,
      occ.jour,
      occ.courseLabel,
      occ.status === "MODIFIEE" ? "Modifiée" : "Non modifiée",
      a ? CHANGE_TYPE_LABELS[a.type] ?? a.type : "",
      a ? a.delta : 0,
      a?.aVerifier ? "Oui" : "",
      a?.tardif ? "Oui" : "",
      a?.autreProf ?? "",
      a?.comment ?? "",
    ]);
  }
  if (r.occurrences.length === 0) {
    sheet.addRow(["—", "", "Aucun cours à jour fixe rattaché ce mois-ci.", "", "", "", "", "", "", ""]);
  }

  // --- Ajustements hors planning propre (remplacement d'un·e collègue, "Autre" sans cours, anomalie de date) ---
  if (r.extraAdjustments.length > 0) {
    sheet.addRow([]);
    const sectionRow = sheet.addRow(["Autres changements déclarés (hors planning propre de ce prof)"]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, 10);
    sectionRow.font = { bold: true };
    for (const a of r.extraAdjustments) {
      sheet.addRow([
        a.date ?? "",
        "",
        a.courseLabel ?? "",
        "",
        CHANGE_TYPE_LABELS[a.type] ?? a.type,
        a.delta,
        a.aVerifier ? "Oui" : "",
        a.tardif ? "Oui" : "",
        a.autreProf ?? "",
        a.comment ?? "",
      ]);
    }
  }

  // --- Cours sans jour fixe (packs) : non inclus dans le calendrier, à vérifier manuellement ---
  if (r.coursesSansJourFixe > 0) {
    sheet.addRow([]);
    const note = sheet.addRow([
      `${r.coursesSansJourFixe} cours sans jour fixe rattaché·s (ex. "packs" Etudes/SAE) — non comptés ci-dessus, à vérifier manuellement.`,
    ]);
    sheet.mergeCells(note.number, 1, note.number, 10);
    note.font = { italic: true, color: { argb: "FF8A6D00" } };
  }

  // --- Total ---
  sheet.addRow([]);
  const totalPrevuRow = sheet.addRow(["Cours prévus (base)", "", "", "", "", r.coursesPrevus]);
  totalPrevuRow.font = { bold: true };
  const totalAjustRow = sheet.addRow(["Ajustements déclarés", "", "", "", "", r.totalAjustementsCours]);
  totalAjustRow.font = { bold: true };
  const totalRow = sheet.addRow(["Total cours du mois", "", "", "", "", r.totalFinal]);
  totalRow.font = { bold: true, size: 12 };
}
