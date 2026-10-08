import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";
import AdminReports from "@/components/AdminReports";

// Archive des rapports Excel envoyés automatiquement (verrouillage du 20,
// résumé final du 26) — demande de Rene du 08.10.2026. Même accès que le
// bouton Export de la vue d'ensemble : ADMIN, COMPTABILITE, DIRECTION et
// SECRETARIAT.
export default async function RapportsPage() {
  const admin = await requireAdmin([
    AdminRole.ADMIN,
    AdminRole.COMPTABILITE,
    AdminRole.DIRECTION,
    AdminRole.SECRETARIAT,
  ]);
  if (!admin) redirect("/connexion");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Rapports</h1>
      <AdminReports />
    </div>
  );
}
