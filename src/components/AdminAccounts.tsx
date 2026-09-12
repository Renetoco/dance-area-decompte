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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/admin/admins");
    if (res.ok) setAdmins((await res.json()).admins);
  }

  useEffect(() => {
    load();
  }, []);

  function draftFor(a: AdminAccount) {
    return emailDrafts[a.id] ?? a.email;
  }

  function isDirty(a: AdminAccount) {
    return draftFor(a).trim() !== a.email.trim();
  }

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

  async function enregistrerEmail(a: AdminAccount) {
    const newEmail = draftFor(a).trim();
    if (!newEmail || newEmail === a.email) return;
    setBusyId(a.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/admins/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Échec de la mise à jour de l'email.");
        return;
      }
      setMessage(`Email mis à jour pour ${a.name} (${newEmail}).`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(a: AdminAccount) {
    setBusyId(a.id);
    try {
      await fetch(`/api/admin/admins/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !a.active }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <p className="muted">
        Comptes avec accès au dashboard (comptabilité, direction) ou administrateur complet. L'email peut être
        corrigé à tout moment ci-dessous ; la personne garde son mot de passe existant.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const dirty = isDirty(a);
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="email"
                        style={{ width: 200 }}
                        value={draftFor(a)}
                        onChange={(e) => setEmailDrafts({ ...emailDrafts, [a.id]: e.target.value })}
                      />
                      {dirty && (
                        <button
                          className="btn small"
                          disabled={busyId === a.id}
                          onClick={() => enregistrerEmail(a)}
                          title="Enregistrer le nouvel email"
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{ROLE_LABELS[a.role]}</td>
                  <td>
                    <span className={`badge ${a.active ? "success" : "neutral"}`}>
                      {a.active ? "Actif" : "Désactivé"}
                    </span>
                  </td>
                  <td>
                    <button className="btn secondary small" disabled={busyId === a.id} onClick={() => toggleActive(a)}>
                      {a.active ? "Désactiver" : "Réactiver"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && <p className="muted" style={{ marginTop: 10 }}>{message}</p>}

      <h3 style={{ marginTop: 20, fontSize: "0.9rem" }}>Créer un nouveau compte</h3>
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
        <button className="btn" style={{ marginTop: 10 }} disabled={busy}>
          Créer le compte
        </button>
      </form>
    </div>
  );
}
