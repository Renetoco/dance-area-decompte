import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import LogoutButton from "@/components/LogoutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/connexion");

  const roleLabel =
    admin.role === "ADMIN" ? "Administrateur" : admin.role === "COMPTABILITE" ? "Comptabilité" : "Direction";

  return (
    <main className="page-wide">
      <div className="top-bar">
        <div>
          <h1>Dance Area — Administration</h1>
          <p className="muted">
            {admin.name} · {roleLabel}
          </p>
        </div>
        <LogoutButton />
      </div>
      <AdminNav role={admin.role} />
      {children}
    </main>
  );
}
