"use client";

import { useEffect, useState } from "react";

type AdminAccount = { id: string; name: string; email: string; role: "ADMIN" | "COMPTABILITE" | "DIRECTION"; active: boolean };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  COMPTABILITE: "Comptabilité",
  DIRECTION: "Direction",
};

export default function AdminAccounts() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"COMPTABILITE" | "DIRECTION" | "ADMIN">("COMPTABILITE");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/admins");
    if (res.ok) setAdmins((await res.json()).admins);
  }

  useEffect(() => {
    load();
  }, []);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error);
        return;
      }
      setMessage(`Compte créé pour ${email}, identifiants envoyés par email.`);
      setName("");
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="muted">
        Comptes avec accès au dashboard (comptabilité, direction) ou administrateur complet.
      </p>
      <ul>
        {admins.map((a) => (
          <li key={a.id}>
            {a.name} — {a.email} — {ROLE_LABELS[a.role]} {!a.active && "(désactivé)"}
          </li>
        ))}
      </ul>
      <form onSubmit={createAccount}>
        <div className="btn-row">
          <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            placeholder="email@dancearea.ch"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as any)} style={{ marginTop: 8 }}>
          <option value="COMPTABILITE">Comptabilité</option>
          <option value="DIRECTION">Direction</option>
          <option value="ADMIN">Administrateur</option>
        </select>
        {message && <p className="muted">{message}</p>}
        <button className="btn" style={{ marginTop: 10 }} disabled={busy}>
          Créer le compte
        </button>
      </form>
    </div>
  );
}
