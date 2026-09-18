import { redirect } from "next/navigation";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { AdminRole } from "@prisma/client";
import AdminTeachers from "@/components/AdminTeachers";

// Onglet dédié aux profs et musicien·nes, ouvert à tout compte backend
// (comme l'onglet Cours) — demande de Rene du 18.09.2026, remplace l'ancien
// tableau "Comptes des profs" qui vivait dans /admin/administration
// (réservé au seul compte ADMIN). L'ajout/la modification restent réservés
// à qui peut gérer les cours (voir canManageCourses).
export default async function ProfsListPage() {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) redirect("/connexion");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Profs & musicien·nes</h1>
      <p className="muted">
        Cliquez sur un nom pour voir sa fiche : cours dont il/elle est titulaire, interventions comme musicien·ne
        ou co-enseignant·e, et l'historique de ses déclarations.
      </p>
      <AdminTeachers canManageCourses={canManageCourses(admin)} />
    </div>
  );
}
