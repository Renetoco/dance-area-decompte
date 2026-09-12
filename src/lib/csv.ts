import { prisma } from "./db";
import { formatPeriodLabel } from "./dates";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué (a couvert un·e collègue)",
  ABSENCE_REMPLACEE: "Absence remplacée (a été remplacé·e)",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Non soumis",
  SUBMITTED_MANUAL: "Soumis manuellement",
  SUBMITTED_AUTO: "Soumis automatiquement (deadline dépassée)",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = [
  "Code analytique",
  "Nom du prof",
  "Période",
  "Statut de la déclaration",
  "A déclaré des changements",
  "Date de soumission",
  "Type de changement",
  "Cours concerné",
  "Date de l'occurrence",
  "Heures",
  "Autre prof concerné",
  "Commentaire",
];

/** Génère le CSV du cycle (une ligne par changement déclaré, + une ligne
 * "aucun changement" par prof sans changement) — voir
 * project/specifications/specifications-fonctionnelles.md#dashboard */
export async function generateCsvForPeriod(period: string): Promise<string> {
  const declarations = await prisma.monthlyDeclaration.findMany({
    where: { period },
    include: {
      teacher: { select: { name: true, analyticCode: true } },
      items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } } },
    },
    orderBy: { teacher: { name: "asc" } },
  });

  const rows: string[][] = [];

  for (const decl of declarations) {
    const base = [
      decl.teacher.analyticCode,
      decl.teacher.name,
      formatPeriodLabel(decl.period),
      STATUS_LABELS[decl.status] ?? decl.status,
      decl.hasChanges ? "Oui" : "Non",
      decl.submittedAt ? decl.submittedAt.toISOString() : "",
    ];

    if (!decl.hasChanges || decl.items.length === 0) {
      rows.push([...base, "", "", "", "", "", ""]);
      continue;
    }

    for (const item of decl.items) {
      rows.push([
        ...base,
        CHANGE_TYPE_LABELS[item.type] ?? item.type,
        item.course ? `${item.course.code} — ${item.course.nomCours}` : "",
        item.date ? item.date.toISOString().slice(0, 10) : "",
        item.hours != null ? String(item.hours) : "",
        item.otherTeacher?.name ?? item.otherTeacherFreeText ?? "",
        item.comment ?? "",
      ]);
    }
  }

  const lines = [HEADERS, ...rows].map((row) => row.map(csvEscape).join(";"));
  const BOM = "﻿"; // pour un import propre dans Excel
  return BOM + lines.join("\r\n") + "\r\n";
}
