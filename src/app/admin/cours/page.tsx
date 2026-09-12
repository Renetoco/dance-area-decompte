import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";
import AdminCourses from "@/components/AdminCourses";

export default async function CoursListPage() {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) redirect("/connexion");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Cours</h1>
      <p className="muted">
        Cliquez sur un cours pour voir sa fiche : titulaire, musicien·nes ou co-profs rattaché·es, et l'historique
        des changements déclarés sur ce cours.
      </p>
      <AdminCourses />
    </div>
  );
}
