"use client";

import { useEffect, useState } from "react";

type Teacher = {
  id: string;
  analyticCode: string;
  name: string;
  email: string | null;
  active: boolean;
  mustResetPwd: boolean;
  _count: { courses: number };
};

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/teachers");
    if (res.ok) setTeachers((await res.json()).teachers);
  }

  useEffect(() => {
    load();
  }, []);

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
      if (res.ok) {
        setMessage(`Compte activé et identifiants envoyés à ${email}.`);
        await load();
      }
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

  return (
    <div>
      {message && <div className="success-msg">{message}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Nom</th>
              <th>Cours</th>
              <th>Email / compte</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id}>
                <td>{t.analyticCode}</td>
                <td>{t.name}</td>
                <td>{t._count.courses}</td>
                <td>
                  {t.email ?? (
                    <input
                      placeholder="email@dancearea.ch"
                      style={{ width: 200 }}
                      value={emailDrafts[t.id] ?? ""}
                      onChange={(e) => setEmailDrafts({ ...emailDrafts, [t.id]: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  <span className={`badge ${t.active ? "success" : "neutral"}`}>
                    {t.active ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td>
                  <div className="btn-row">
                    {!t.email && (
                      <button className="btn small" disabled={busyId === t.id} onClick={() => activer(t.id)}>
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
