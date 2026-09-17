"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export default function CourseEditForm({
  courseId,
  initialNomCours,
  initialJour,
  initialHeureDebut,
  initialHeureFin,
  canEdit,
}: {
  courseId: string;
  initialNomCours: string;
  initialJour: string | null;
  initialHeureDebut: string | null;
  initialHeureFin: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nomCours, setNomCours] = useState(initialNomCours);
  const [jour, setJour] = useState(initialJour ?? "");
  const [heureDebut, setHeureDebut] = useState(initialHeureDebut ?? "");
  const [heureFin, setHeureFin] = useState(initialHeureFin ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomCours,
          jour: jour || null,
          heureDebut: heureDebut || null,
          heureFin: heureFin || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de la modification.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setNomCours(initialNomCours);
    setJour(initialJour ?? "");
    setHeureDebut(initialHeureDebut ?? "");
    setHeureFin(initialHeureFin ?? "");
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button className="btn secondary small" onClick={() => setEditing(true)} style={{ marginTop: 8 }}>
        Modifier le nom, le jour ou l'horaire
      </button>
    );
  }

  return (
    <div className="card nested" style={{ marginTop: 8 }}>
      {error && <div className="error-msg">{error}</div>}

      <label>Nom du cours</label>
      <input value={nomCours} onChange={(e) => setNomCours(e.target.value)} />

      <label>Jour</label>
      <select value={jour} onChange={(e) => setJour(e.target.value)}>
        <option value="">— Sans jour fixe (ex. pack) —</option>
        {JOURS.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </select>

      <div className="btn-row" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Heure de début</label>
          <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Heure de fin</label>
          <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={cancel} disabled={busy}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy || !nomCours.trim()}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
