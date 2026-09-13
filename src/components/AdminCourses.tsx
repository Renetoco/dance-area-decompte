"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CourseRow = {
  id: string;
  code: string;
  categorie: string;
  nomCours: string;
  jour: string | null;
  heureDebut: string | null;
  heureFin: string | null;
  teacher: { id: string; name: string } | null;
  _count: { participants: number };
};

type TeacherLite = { id: string; name: string; active: boolean };

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const emptyForm = {
  code: "",
  categorie: "",
  nomCours: "",
  jour: "",
  heureDebut: "",
  heureFin: "",
  teacherId: "",
};

export default function AdminCourses() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [addBusy, setAddBusy] = useState(false);

  function loadCourses() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    return fetch(`/api/admin/courses?${params}`)
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/admin/teachers")
      .then((r) => r.json())
      .then((d) => setTeachers((d.teachers ?? []).filter((t: any) => t.active)));
  }, []);

  useEffect(() => {
    const t = setTimeout(loadCourses, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function ajouterCours(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          categorie: form.categorie,
          nomCours: form.nomCours,
          jour: form.jour || null,
          heureDebut: form.heureDebut || null,
          heureFin: form.heureFin || null,
          teacherId: form.teacherId || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Échec de la création.");
        return;
      }
      setMessage(`Le cours « ${form.nomCours} » a été ajouté.`);
      setForm(emptyForm);
      setShowAddForm(false);
      await loadCourses();
    } finally {
      setAddBusy(false);
    }
  }

  async function supprimerCours(c: CourseRow) {
    if (confirmDeleteId !== c.id) {
      // Étape de sécurité : un premier clic demande confirmation, le
      // deuxième clic supprime réellement.
      setConfirmDeleteId(c.id);
      return;
    }
    setBusyId(c.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/courses/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Échec de la suppression.");
        return;
      }
      setMessage(`Le cours « ${c.nomCours} » a été supprimé.`);
      await loadCourses();
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div>
      <div className="filters">
        <input
          placeholder="Rechercher un cours, un code, un·e prof..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <p className="muted">Chargement...</p>}
      {message && <div className="success-msg">{message}</div>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Cours</th>
              <th>Catégorie</th>
              <th>Jour</th>
              <th>Horaire</th>
              <th>Titulaire</th>
              <th>Participant·es</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="is-clickable">
                <td className="muted">{c.code}</td>
                <td>
                  <Link href={`/admin/cours/${c.id}`}>{c.nomCours}</Link>
                </td>
                <td>{c.categorie}</td>
                <td>{c.jour ?? "—"}</td>
                <td>{c.heureDebut ? `${c.heureDebut} – ${c.heureFin ?? ""}` : "—"}</td>
                <td>
                  {c.teacher ? <Link href={`/admin/profs/${c.teacher.id}`}>{c.teacher.name}</Link> : "—"}
                </td>
                <td>{c._count.participants > 0 ? `${c._count.participants}` : "—"}</td>
                <td>
                  <div className="btn-row">
                    <button
                      className="btn danger small"
                      disabled={busyId === c.id}
                      onClick={() => supprimerCours(c)}
                    >
                      {confirmDeleteId === c.id ? "Confirmer ?" : "Supprimer"}
                    </button>
                    {confirmDeleteId === c.id && (
                      <button className="btn secondary small" onClick={() => setConfirmDeleteId(null)}>
                        Annuler
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && courses.length === 0 && <p className="muted">Aucun cours ne correspond à cette recherche.</p>}

      <div style={{ marginTop: 20 }}>
        {!showAddForm ? (
          <button className="btn secondary" onClick={() => setShowAddForm(true)}>
            + Ajouter un cours
          </button>
        ) : (
          <form onSubmit={ajouterCours} className="card nested">
            <h3 style={{ marginTop: 0, fontSize: "0.9rem" }}>Ajouter un nouveau cours</h3>
            <div className="btn-row">
              <input
                placeholder="Code (ex. 26.1234)"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
              <input
                placeholder="Nom du cours"
                value={form.nomCours}
                onChange={(e) => setForm({ ...form, nomCours: e.target.value })}
                required
              />
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <input
                placeholder="Catégorie (ex. Ados-Adultes 2026-2027)"
                value={form.categorie}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
              />
              <select value={form.jour} onChange={(e) => setForm({ ...form, jour: e.target.value })}>
                <option value="">Jour (facultatif)</option>
                {JOURS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <input
                type="time"
                value={form.heureDebut}
                onChange={(e) => setForm({ ...form, heureDebut: e.target.value })}
              />
              <input
                type="time"
                value={form.heureFin}
                onChange={(e) => setForm({ ...form, heureFin: e.target.value })}
              />
            </div>
            <select
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
              style={{ marginTop: 8 }}
            >
              <option value="">Titulaire (facultatif)</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
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
