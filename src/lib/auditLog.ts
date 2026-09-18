import { prisma } from "./db";
import { AdminRole } from "@prisma/client";

/**
 * Journal des actions structurelles backend (cours, profs, musicien·nes,
 * comptes admin) — demande de Rene du 18.09.2026, pour pouvoir tracer qui a
 * modifié quoi et corriger en cas d'erreur, maintenant que la gestion des
 * cours/profs est ouverte à plus de comptes (voir canManageCourses).
 *
 * Volontairement best-effort : un échec d'écriture du journal ne doit
 * jamais faire échouer l'action elle-même (ex. le prof a bien été créé même
 * si la ligne de journal n'a pas pu être enregistrée).
 */
export async function logAdminAction(
  admin: { name: string; role: AdminRole },
  opts: {
    action: string;
    entityType: string;
    entityId?: string | null;
    description: string;
  }
) {
  try {
    await prisma.adminActionLog.create({
      data: {
        adminName: admin.name,
        adminRole: admin.role,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId ?? null,
        description: opts.description,
      },
    });
  } catch (e) {
    console.error("Échec d'écriture du journal admin :", e);
  }
}
