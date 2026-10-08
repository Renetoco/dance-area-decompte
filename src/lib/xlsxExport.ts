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
 * Formules Excel (demande de Rene du 08.10.2026, relayée par ses
 * collègues) : les totaux de chaque onglet prof (Cours prévus, Ajustements
 * déclarés, Cours AJB, Total cours du mois) sont des formules Excel
 * (COUNTA/SUM sur les lignes du calendrier au-dessus), et les colonnes
 * "Cours prévus (base)" / "Ajustements déclarés" / "Total cours du mois" du
 * Résumé pointent vers ces mêmes cellules (référence inter-onglets). Ainsi,
 * si quelqu'un corrige une valeur "Impact" à la main dans l'onglet d'un
 * prof (ou directement le total du Résumé pour "Cours AJB"), le total de
 * cet onglet ET la ligne correspondante du Résumé se recalculent tout
 * seuls, comme dans un tableur normal — au lieu de rester des nombres figés
 * calculés une fois pour toutes côté serveur.
 *
 * Toutes les valeurs libres saisies par les profs (commentaire, nom de
 * remplaçant·e en texte libre) restent écrites comme simples valeurs de
 * cellule "string" — JAMAIS comme formule, et jamais interpolées dans une
 * formule — donc pas de risque d'injection de formule Excel (contrairement
 * à un export CSV brut, voir SECURITY-REVIEW.md #4, qui ne s'applique pas
 * ici). Seules des valeurs numériques déjà calculées côté serveur (deltas,
 * compteurs) et des références de cellules/onglets construites par ce
 * fichier entrent dans une formule.
 */
export async function generateXlsxForPeriod(period: string, teacherIds?: string[]): Promise<ExcelJS.Buffer> {
  const rows = await computePayrollForPeriod(period, teacherIds);

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.title = `Décompte Dance Area — ${formatPeriodLabel(period)}`;

  // Onglet réservé en premier (pour rester le premier du classeur), rempli
  // après la construction des onglets profs ci-dessous : ses cellules de
  // totaux sont des formules qui pointent vers le total de l'onglet du
  // prof concerné (voir fillResumeSheet).
  const resume = buildResumeSheet(workbook);

  buildAVerifierSheet(workbook, rows, period);

  const usedNames = new Set<string>();
  const teacherSheetTotals = new Map<string, TeacherSheetTotals>();
  for (const r of rows) {
    const sheetName = safeSheetName(r.teacherName, usedNames);
    teacherSheetTotals.set(r.teacherId, buildTeacherSheet(workbook, r, period, sheetName));
  }

  fillResumeSheet(resume, rows, teacherSheetTotals);

  return (await workbook.xlsx.writeBuffer()) as ExcelJS.Buffer;
}

/** Position, dans l'onglet d'un prof, des lignes de total (colonne F) — pour que le Résumé puisse y pointer. */
type TeacherSheetTotals = {
  sheetName: string;
  totalPrevuRow: number;
  totalAjustRow: number;
  totalAjbRow: number | null; // null si le prof n'est pas marqué "AJB"
  totalRow: number;
};

/** Référence inter-onglets Excel, avec le nom d'onglet correctement échappé (apostrophes doublées). */
function sheetRef(sheetName: string, cell: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!${cell}`;
}

function buildResumeSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
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
    { header: "Cours AJB (mois)", key: "ajbTotal", width: 16 },
    { header: "AJB rempli ?", key: "ajbRempli", width: 14 },
    { header: "Statut de la déclaration", key: "statut", width: 28 },
  ];
  resume.getRow(1).font = HEADER_FONT;
  resume.autoFilter = { from: "A1", to: "M1" };
  return resume;
}

/**
 * Remplit le Résumé une fois tous les onglets profs construits. "Cours
 * prévus (base)" et "Ajustements déclarés" sont des formules qui pointent
 * vers le total de l'onglet du prof (voir TeacherSheetTotals) — une
 * correction manuelle faite directement dans l'onglet d'un prof se
 * répercute donc aussi ici. "Total cours du mois" est une formule locale
 * (= Cours prévus + Ajustements + Cours AJB), pour rester cohérente même si
 * quelqu'un corrige "Cours AJB (mois)" à la main directement sur cette
 * ligne du Résumé.
 *
 * "Cours AJB (mois)" reste une valeur statique (pas une formule) : c'est le
 * seul endroit où "Non rempli" (texte, saisie AJB pas encore faite) doit
 * rester distinct de 0 (saisie faite, 0 cours) — demande de Rene du
 * 18.09.2026 — ce que la cellule miroir de l'onglet prof ne peut pas
 * représenter (elle affiche toujours un nombre). La formule du total gère
 * ce cas via IF(ISNUMBER(...)) : "Non rempli" compte comme 0, exactement
 * comme le calcul serveur (voir payroll.ts, ajbTotal = ajbCourseCount ?? 0).
 */
function fillResumeSheet(resume: ExcelJS.Worksheet, rows: PayrollTeacherRow[], teacherSheetTotals: Map<string, TeacherSheetTotals>) {
  for (const r of rows) {
    const t = teacherSheetTotals.get(r.teacherId);
    const prevus = t ? { formula: sheetRef(t.sheetName, `F${t.totalPrevuRow}`) } : r.coursesPrevus;
    const ajustements = t ? { formula: sheetRef(t.sheetName, `F${t.totalAjustRow}`) } : r.totalAjustementsCours;

    const rowNumber = resume.rowCount + 1;
    const total = { formula: `D${rowNumber}+E${rowNumber}+IF(ISNUMBER(K${rowNumber}),K${rowNumber},0)` };

    resume.addRow({
      code: r.analyticCode,
      nom: r.teacherName,
      role: ROLE_LABELS[r.role] ?? r.role,
      prevus,
      ajustements,
      total,
      sansJour: r.coursesSansJourFixe || "",
      aVerifier: r.aVerifierCount || "",
      // "Oui" = déclaration avec changements saisis ; "Non" = envoyée
      // (manuellement ou automatiquement) sans aucune modification ; "—" =
      // pas encore de déclaration pour ce mois-ci — demande de Rene du
      // 16.09.2026, pour distinguer d'un coup d'œil ce qui a vraiment été
      // modifié de ce qui a été envoyé tel quel.
      modifie: r.hasChanges === true ? "Oui" : r.hasChanges === false ? "Non" : "—",
      tardif: r.tardifCount || "",
      // Cours AJB : ne concerne que les profs marqué·es Teacher.ajbTeacher —
      // vide pour les autres (rien à y déclarer). "Non rempli" plutôt que 0
      // pour bien distinguer "n'a pas encore rempli" de "a rempli 0" —
      // demande de Rene du 18.09.2026.
      ajbTotal: r.isAjbTeacher
        ? r.ajbCourseCount !== null || r.ajbLateEntries.length > 0
          ? (r.ajbCourseCount ?? 0) + r.ajbLateEntries.length
          : "Non rempli"
        : "",
      ajbRempli: r.isAjbTeacher ? (r.ajbCourseCount !== null ? "Oui" : "Non") : "",
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

function buildTeacherSheet(
  workbook: ExcelJS.Workbook,
  r: PayrollTeacherRow,
  period: string,
  sheetName: string
): TeacherSheetTotals {
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
  // Colonne F (Impact) de ce bloc : référencée par la formule "Cours
  // prévus" (COUNTA sur la colonne Date) et par "Ajustements déclarés"
  // (SUM sur ce bloc + le bloc "hors planning" ci-dessous).
  const occFirstRow = headerRow.number + 1;
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
  const occLastRow = occFirstRow + Math.max(r.occurrences.length, 1) - 1;

  // --- Ajustements hors planning propre (remplacement d'un·e collègue, "Autre" sans cours, anomalie de date) ---
  let extraLastRow: number | null = null;
  if (r.extraAdjustments.length > 0) {
    sheet.addRow([]);
    const sectionRow = sheet.addRow(["Autres changements déclarés (hors planning propre de ce prof)"]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, 10);
    sectionRow.font = { bold: true };
    const extraFirstRow = sectionRow.number + 1;
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
    extraLastRow = extraFirstRow + r.extraAdjustments.length - 1;
  }

  // --- Cours AJB (saisis à la main, ne figurent pas dans le calendrier ci-dessus) ---
  // Les lignes d'entrée tardive AJB (colonne F = 1 chacune) sont référencées
  // par la formule "Cours AJB (mois)" ci-dessous ; la part "déclarée avant
  // la deadline" (r.ajbCourseCount) n'a pas de ligne propre dans cet onglet
  // (saisie sous forme de compteur, pas de liste) donc reste un nombre
  // littéral dans la formule du total.
  let ajbFirstRow: number | null = null;
  let ajbLastRow: number | null = null;
  if (r.isAjbTeacher) {
    sheet.addRow([]);
    const ajbSectionRow = sheet.addRow([
      `Cours AJB — ${r.ajbCourseCount !== null ? `${r.ajbCourseCount} déclaré(s) avant la date limite` : "champ non rempli (0 pris en compte)"}`,
    ]);
    sheet.mergeCells(ajbSectionRow.number, 1, ajbSectionRow.number, 10);
    ajbSectionRow.font = { bold: true };
    if (r.ajbLateEntries.length === 0) {
      const note = sheet.addRow(["Aucune entrée tardive AJB ce mois-ci."]);
      sheet.mergeCells(note.number, 1, note.number, 10);
      note.font = { italic: true, color: { argb: "FF555555" } };
    } else {
      ajbFirstRow = ajbSectionRow.number + 1;
      for (const e of r.ajbLateEntries) {
        sheet.addRow([
          e.date ?? "",
          e.heure ?? "",
          e.nomCours,
          "",
          "Cours AJB tardif",
          1,
          "",
          "Oui",
          "",
          e.comment ?? "",
        ]);
      }
      ajbLastRow = ajbFirstRow + r.ajbLateEntries.length - 1;
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

  // --- Total : formules Excel plutôt que des nombres figés, pour qu'une
  // correction manuelle d'une case "Impact" ci-dessus (ou ajoutée/retirée)
  // se répercute automatiquement ici — demande de Rene du 08.10.2026. ---
  sheet.addRow([]);

  // "Cours prévus (base)" = nombre de séances du calendrier ci-dessus. Pas
  // de formule quand il n'y a aucune occurrence : la ligne-espace "Aucun
  // cours à jour fixe..." n'est pas une vraie ligne de calendrier (COUNTA
  // la compterait à tort comme 1).
  const totalPrevuRow = sheet.addRow([
    "Cours prévus (base)",
    "",
    "",
    "",
    "",
    r.occurrences.length > 0 ? { formula: `COUNTA(A${occFirstRow}:A${occLastRow})` } : 0,
  ]);
  totalPrevuRow.font = { bold: true };

  // "Ajustements déclarés" = somme des Impact du calendrier + du bloc "hors
  // planning" (les deux blocs sont contigus ; les lignes vides/titres
  // entre eux n'ont rien en colonne F donc SUM les ignore sans fausser le
  // total).
  const totalAjustRow = sheet.addRow([
    "Ajustements déclarés",
    "",
    "",
    "",
    "",
    { formula: `SUM(F${occFirstRow}:F${extraLastRow ?? occLastRow})` },
  ]);
  totalAjustRow.font = { bold: true };

  let totalAjbRowNumber: number | null = null;
  if (r.isAjbTeacher) {
    const base = r.ajbCourseCount ?? 0;
    const totalAjbRow = sheet.addRow([
      "Cours AJB (mois)",
      "",
      "",
      "",
      "",
      ajbFirstRow !== null && ajbLastRow !== null ? { formula: `${base}+SUM(F${ajbFirstRow}:F${ajbLastRow})` } : base,
    ]);
    totalAjbRow.font = { bold: true };
    totalAjbRowNumber = totalAjbRow.number;
  }

  const totalParts = [`F${totalPrevuRow.number}`, `F${totalAjustRow.number}`];
  if (totalAjbRowNumber !== null) totalParts.push(`F${totalAjbRowNumber}`);
  const totalRow = sheet.addRow(["Total cours du mois", "", "", "", "", { formula: totalParts.join("+") }]);
  totalRow.font = { bold: true, size: 12 };

  return {
    sheetName,
    totalPrevuRow: totalPrevuRow.number,
    totalAjustRow: totalAjustRow.number,
    totalAjbRow: totalAjbRowNumber,
    totalRow: totalRow.number,
  };
}
