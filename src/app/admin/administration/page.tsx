import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminRole } from "@prisma/client";
import AdminImport from "@/components/AdminImport";
import AdminAccounts from "@/components/AdminAccounts";

export default async function AdministrationPage() {
  const admin = await requireAdmin([AdminRole.ADMIN]);
  if (!admin) redirect("/admin");

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>QR code d'accès</h2>
      <div className="card">
        <p className="muted">
          À imprimer et afficher à l'école — pointe vers la page de connexion.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/admin/qr-code" alt="QR code d'accès à la plateforme" width={200} height={200} />
        <div>
          <a className="btn secondary small" href="/api/admin/qr-code" target="_blank" rel="noreferrer">
            Ouvrir en grand / imprimer
          </a>
        </div>
      </div>

      <h2>Import annuel du planning</h2>
      <AdminImport />
      <p className="muted">
        Les comptes des profs et musicien·nes se gèrent désormais depuis l'onglet{" "}
        <a href="/admin/profs">Profs & musicien·nes</a>.
      </p>
      <h2>Comptes comptabilité / direction / administrateur</h2>
      <AdminAccounts />
    </div>
  );
}
