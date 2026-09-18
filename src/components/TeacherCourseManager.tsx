"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CourseRow = {
  id: string;
  code: string;
  nomCours: string;
  jour: string | null;
  heureDebut: string | null;
  heureFin: string | null;
};

type CourseOption = {
  id: string;
  code: string;
  nomCours: string;
  jour: string | null;
  heureDebut: string | null;
  heureFin: string | null;
  teacher: { id: string; name: string } | null;
};

function scheduleLabel(c: { jour: string | null; heureDebut: string | null; heureFin: string | null }) {
  if (!c.jour) return "sans jour fixe";
  return c.heureDebut ? `${c.jour} ${c.heureDebut}–${c.heureFin ?? ""}` : c.jour;
}

// Gère, depuis la fiche prof, les cours dont cette personne est titulaire —
// symétrique de CourseTeacherEditor sur la fiche du cours (même endpoint,
// PATCH /api/admin/courses/[id]), pour que les deux vues restent toujours
// cohérentes entre elles (demande de Rene du 18.09.2026). Réservé à qui
// peut gérer les cours (canManageCourses).
export default function TeacherCourseManager({
  teacherId,
  initialCourses,
  availableCourses,
  canEdit,
}: {
  teacherId: string;
  initialCourses: CourseRow[];
  availableCourses: CourseOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = availableCourses.filter((c) => !courses.some((existing) => existing.id === c.id));

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    const target = options.find((c) => c.id === courseId);
    if (
      target?.teacher &&
      !confirm(`« ${target.nomCours} » a déjà un·e titulaire (${target.teacher.name}). Le/la remplacer ?`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de l'ajout.");
        return;
      }
      setCourses([...courses, data.course]);
      setCourseId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeCourse(course: CourseRow) {
    if (!confirm(`Retirer « ${course.nomCours} » des cours de ce prof ? Le cours restera dans le planning, sans titulaire.`)) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: null }),
      });
      setCourses(courses.filter((c) => c.id !== course.id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {courses.length === 0 ? (
        <p className="muted">Aucun cours rattaché.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Cours</th>
                <th>Jour</th>
                <th>Horaire</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{c.code}</td>
                  <td>
                    <Link href={`/admin/cours/${c.id}`}>{c.nomCours}</Link>
                  </td>
                  <td>{c.jour ?? "—"}</td>
                  <td>{c.heureDebut ? `${c.heureDebut} – ${c.heureFin ?? ""}` : "—"}</td>
                  {canEdit && (
                    <td>
                      <button className="btn danger small" disabled={busy} onClick={() => removeCourse(c)}>
                        Retirer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={addCourse} style={{ marginTop: 14 }}>
          {error && <div className="error-msg">{error}</div>}
          <div className="btn-row">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">— Ajouter un cours dont il/elle sera titulaire —</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code}) — {scheduleLabel(c)} — titulaire actuel·le : {c.teacher ? c.teacher.name : "aucun·e"}
                </option>
              ))}
            </select>
            <button className="btn small" disabled={busy || !courseId}>
              Ajouter
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
