"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type TeacherOption = { id: string; name: string; role: "ENSEIGNANT" | "MUSICIEN" };

// Permet de changer le·la titulaire d'un cours depuis sa fiche — réservé à
// qui peut gérer les cours (demande de Rene du 18.09.2026 : "l'info côté
// cours doit correspondre à l'info côté prof", voir la gestion symétrique
// des cours d'un prof depuis /admin/profs/[id]). Passe par le même endpoint
// (PATCH /api/admin/courses/[id]) que la fiche prof, donc les deux vues
// restent toujours cohérentes entre elles.
export default function CourseTeacherEditor({
  courseId,
  courseNomCours,
  initialTeacher,
  teachers,
  canEdit,
}: {
  courseId: string;
  courseNomCours: string;
  initialTeacher: { id: string; name: string } | null;
  teachers: TeacherOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [teacher, setTeacher] = useState(initialTeacher);
  const [editing, setEditing] = useState(false);
  const [teacherId, setTeacherId] = useState(initialTeacher?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const nextTeacher = teacherId ? teachers.find((t) => t.id === teacherId) ?? null : null;
    if (
      teacher &&
      nextTeacher &&
      nextTeacher.id !== teacher.id &&
      !confirm(`« ${courseNomCours} » a déjà un·e titulaire (${teacher.name}). Le/la remplacer par ${nextTeacher.name} ?`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: teacherId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de la modification.");
        return;
      }
      setTeacher(nextTeacher);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p>
        {teacher ? (
          <Link href={`/admin/profs/${teacher.id}`}>{teacher.name}</Link>
        ) : (
          <span className="muted">Aucun·e titulaire renseigné·e pour ce cours.</span>
        )}
        {canEdit && (
          <button
            className="btn secondary small"
            style={{ marginLeft: 10 }}
            onClick={() => {
              setTeacherId(teacher?.id ?? "");
              setEditing(true);
            }}
          >
            Modifier
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="card nested" style={{ marginTop: 8, maxWidth: 420 }}>
      {error && <div className="error-msg">{error}</div>}
      <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
        <option value="">— Aucun·e titulaire —</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} {t.role === "MUSICIEN" ? "(musicien·ne)" : ""}
          </option>
        ))}
      </select>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn secondary" onClick={() => setEditing(false)} disabled={busy}>
          Annuler
        </button>
        <button className="btn" onClick={save} disabled={busy}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
