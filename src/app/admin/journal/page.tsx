import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";
import AdminJournal from "@/components/AdminJournal";

// Journal des actions structurelles backend (cours, profs, musicien·nes,
// comptes) — demande de Rene du 18.09.2026, pour pouvoir tracer qui a fait
// quoi et corriger en cas d'erreur, maintenant que la gestion des
// cours/profs est ouverte à plus de comptes. Réservé au compte ADMIN.
export default async function JournalPage() {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) redirect("/admin");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Journal</h1>
      <AdminJournal />
    </div>
  );
}
