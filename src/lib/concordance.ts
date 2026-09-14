import { prisma } from "./db";
import { ChangeType, DeclarationStatus } from "@prisma/client";

export type ConcordanceStatus =
  | "CONCORDANT"
  | "DISCORDANT"
  | "EN_ATTENTE"
  | "NON_VERIFIABLE"
  | "NON_APPLICABLE";

export type ConcordanceResult = {
  status: ConcordanceStatus;
  detail: string;
};

const MIRROR_TYPE: Partial<Record<ChangeType, ChangeType>> = {
  REMPLACEMENT_EFFECTUE: ChangeType.ABSENCE_REMPLACEE,
  ABSENCE_REMPLACEE: ChangeType.REMPLACEMENT_EFFECTUE,
};

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Vérifie si une ligne de type "remplacement effectué" / "absence remplacée"
 * a une ligne miroir chez le/la collègue cité·e — voir la règle dans
 * project/contexte/regles-metier.md (section "Dashboard").
 */
export async function computeConcordance(itemId: string): Promise<ConcordanceResult> {
  const item = await prisma.declarationItem.findUnique({
    where: { id: itemId },
    include: { declaration: true },
  });
  if (!item) return { status: "NON_APPLICABLE", detail: "Ligne introuvable." };

  const mirrorType = MIRROR_TYPE[item.type];
  if (!mirrorType) {
    return { status: "NON_APPLICABLE", detail: "Ce type de changement n'a pas de contrepartie à vérifier." };
  }

  if (!item.otherTeacherId) {
    return {
      status: "NON_VERIFIABLE",
      detail: item.otherTeacherFreeText
        ? `Remplaçant·e externe déclaré·e ("${item.otherTeacherFreeText}") — pas de compte à vérifier.`
        : "Aucun·e collègue identifié·e pour cette ligne.",
    };
  }

  const otherDeclaration = await prisma.monthlyDeclaration.findUnique({
    where: {
      teacherId_period: {
        teacherId: item.otherTeacherId,
        period: item.declaration.period,
      },
    },
    include: { items: true },
  });

  if (!otherDeclaration || otherDeclaration.status === DeclarationStatus.DRAFT) {
    return {
      status: "EN_ATTENTE",
      detail: "L'autre prof n'a pas encore soumis son décompte pour cette période.",
    };
  }

  const match = otherDeclaration.items.find(
    (other) =>
      other.type === mirrorType &&
      other.otherTeacherId === item.declaration.teacherId &&
      (item.courseId ? other.courseId === item.courseId : true) &&
      sameDay(other.date, item.date)
  );

  if (!match) {
    return {
      status: "DISCORDANT",
      detail: "Aucune ligne correspondante trouvée dans le décompte de l'autre prof.",
    };
  }

  return { status: "CONCORDANT", detail: "Les deux profs ont déclaré la même chose." };
}
