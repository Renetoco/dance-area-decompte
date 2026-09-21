import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AdminNav from "@/components/AdminNav";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/connexion");
  if (admin.mustResetPwd) redirect("/admin-mot-de-passe");

  const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Administrateur",
    COMPTABILITE: "Comptabilité",
    DIRECTION: "Direction",
    SECRETARIAT: "Secrétariat",
  };
  const roleLabel = ROLE_LABELS[admin.role] ?? admin.role;

  return (
    <div className="admin-shell">
      <div className="admin-app">
        <aside className="admin-sidebar">
          <div className="brand-chip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanc-900.png" alt="Dance Area" />
            <div className="divider" />
            <span className="label">Décompte</span>
          </div>
          <AdminNav role={admin.role} />
          <div className="sidebar-foot">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </aside>

        <main className="admin-main">
          <div className="admin-topbar">
            <div>
              <h1>Dance Area — Administration</h1>
              <p className="muted">
                {admin.name} · {roleLabel}
              </p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
