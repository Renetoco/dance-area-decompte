"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TeacherRole = "ENSEIGNANT" | "MUSICIEN";

type Teacher = {
  id: string;
  analyticCode: string;
  name: string;
  email: string | null;
  active: boolean;
  mustResetPwd: boolean;
  role: TeacherRole;
  _count: { courses: number };
};

const ROLE_LABELS: Record<TeacherRole, string> = {
  ENSEIGNANT: "Enseignant·e",
  MUSICIEN: "Musicien·ne",
};

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newRole, setNewRole] = useState<TeacherRole>("ENSEIGNANT");
  const [addBusy, setAddBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/teachers");
    if (res.ok) setTeachers((await res.json()).teachers);
  }

  useEffect(() => {
    load();
  }, []);

  function draftFor(t: Teacher) {
    return emailDrafts[t.id] ?? t.email ?? "";
  }

  function isDirty(t: Teacher) {
    return draftFor(t).trim() !== (t.email ?? "").trim();
  }

  async function activer(id: string) {
    const email = emailDrafts[id]?.trim();
    if (!email) return;
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teachers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMessage(
          data?.tempPassword
            ? `Compte activé pour ${email} — mot de passe temporaire : ${data.tempPassword} (aussi envoyé par email${data.emailSent === false ? ", mais l'envoi a échoué : notez-le bien !" : ""}).`
            : `Compte activé et identifiants envoyés à ${email}.`
        );
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function enregistrerEmail(t: Teacher) {
    const email = draftFor(t).trim();
    if (!email || email === (t.email ?? "")) return;
    setBusyId(t.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teachers/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setMessage(
          `Email mis à jour (${email}). Pensez à cliquer sur « Réinitialiser mdp » pour envoyer les identifiants à cette adresse.`
        );
        await load();
      } else {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || "Échec de la mise à jour de l'email.");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(t: Teacher, role: TeacherRole) {
    if (role === t.role) return;
    setBusyId(t.id);
    try {
      await fetch(`/api/admin/teachers/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(t: Teacher) {
    setBusyId(t.id);
    try {
      await fetch(`/api/admin/teachers/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !t.active }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reinitialiser(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teachers/${id}/reinitialiser`, { method: "POST" });
      if (res.ok) setMessage("Nouveau mot de passe envoyé par email.");
    } finally {
      setBusyId(null);
    }
  }

  async function ajouterProf(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, analyticCode: newCode, role: newRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Échec de la création.");
        return;
      }
      setMessage(`${newName} a été ajouté·e. Renseignez son email ci-dessous puis cliquez sur « Activer » pour lui envoyer ses identifiants.`);
      setNewName("");
      setNewCode("");
      setNewRole("ENSEIGNANT");
      setShowAddForm(false);
      await load();
    } finally {
      setAddBusy(false);
    }
  }

  async function supprimerProf(t: Teacher) {
    if (confirmDeleteId !== t.id) {
      // Étape de sécurité : un premier clic demande confirmation, le
      // deuxième clic supprime réellement.
      setConfirmDeleteId(t.id);
      return;
    }
    setBusyId(t.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/teachers/${t.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Échec de la suppression.");
        return;
      }
      setMessage(`${t.name} a été supprimé·e.`);
      await load();
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div>
      {message && <div className="success-msg">{message}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Cours</th>
              <th>Email / compte</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => {
              const dirty = isDirty(t);
              return (
                <tr key={t.id}>
                  <td>{t.analyticCode}</td>
                  <td>
                    <Link href={`/admin/profs/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>
                    <select
                      value={t.role}
                      disabled={busyId === t.id}
                      onChange={(e) => changeRole(t, e.target.value as TeacherRole)}
                      style={{ width: 140 }}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{t._count.courses}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="email"
                        placeholder="email@dancearea.ch"
                        style={{ width: 200 }}
                        value={draftFor(t)}
                        onChange={(e) => setEmailDrafts({ ...emailDrafts, [t.id]: e.target.value })}
                      />
                      {t.email && dirty && (
                        <button
                          className="btn small"
                          disabled={busyId === t.id}
                          onClick={() => enregistrerEmail(t)}
                          title="Enregistrer le nouvel email"
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${t.active ? "success" : "neutral"}`}>
                      {t.active ? "Actif" : "Désactivé"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row">
                      {!t.email && (
                        <button className="btn small" disabled={busyId === t.id || !dirty} onClick={() => activer(t.id)}>
                          Activer
                        </button>
                      )}
                      {t.email && (
                        <button className="btn secondary small" disabled={busyId === t.id} onClick={() => reinitialiser(t.id)}>
                          Réinitialiser mdp
                        </button>
                      )}
                      <button className="btn secondary small" disabled={busyId === t.id} onClick={() => toggleActive(t)}>
                        {t.active ? "Désactiver" : "Réactiver"}
                      </button>
                      <button className="btn danger small" disabled={busyId === t.id} onClick={() => supprimerProf(t)}>
                        {confirmDeleteId === t.id ? "Confirmer ?" : "Supprimer"}
                      </button>
                      {confirmDeleteId === t.id && (
                        <button className="btn secondary small" onClick={() => setConfirmDeleteId(null)}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20 }}>
        {!showAddForm ? (
          <button className="btn secondary" onClick={() => setShowAddForm(true)}>
            + Ajouter un prof
          </button>
        ) : (
          <form onSubmit={ajouterProf} className="card nested">
            <h3 style={{ marginTop: 0, fontSize: "0.9rem" }}>Ajouter un nouveau prof</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Le prof est ajouté·e sans compte pour l'instant : renseignez ensuite son email dans le tableau
              ci-dessus et cliquez sur « Activer » pour lui envoyer ses identifiants.
            </p>
            <div className="btn-row">
              <input placeholder="Nom complet" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <input
                placeholder="Code analytique (ex. 3490)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
              />
            </div>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as TeacherRole)} style={{ marginTop: 8 }}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn secondary" onClick={() => setShowAddForm(false)}>
                Annuler
              </button>
              <button className="btn" disabled={addBusy}>
                Ajouter
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
