"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ParticipantRole = "MUSICIEN" | "CO_ENSEIGNANT";

type ParticipationRow = {
  id: string;
  role: ParticipantRole;
  course: { id: string; code: string; nomCours: string; jour: string | null; heureDebut: string | null; heureFin: string | null };
};

type CourseOption = { id: string; code: string; nomCours: string };

const ROLE_LABELS: Record<ParticipantRole, string> = {
  MUSICIEN: "Musicien·ne",
  CO_ENSEIGNANT: "Co-enseignant·e",
};

// Gère, depuis la fiche prof, les cours où cette personne intervient comme
// musicien·ne ou co-enseignant·e (sans en être titulaire) — symétrique de
// CourseParticipants sur la fiche du cours (même endpoints), pour que les
// deux vues restent toujours cohérentes entre elles (demande de Rene du
// 18.09.2026). Réservé à qui peut gérer les cours (canManageCourses).
export default function TeacherParticipationManager({
  teacherId,
  initialParticipations,
  availableCourses,
  canEdit,
}: {
  teacherId: string;
  initialParticipations: ParticipationRow[];
  availableCourses: CourseOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [participations, setParticipations] = useState(initialParticipations);
  const [courseId, setCourseId] = useState("");
  const [role, setRole] = useState<ParticipantRole>("MUSICIEN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = availableCourses.filter((c) => !participations.some((p) => p.course.id === c.id));

  async function addParticipation(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de l'ajout.");
        return;
      }
      const course = options.find((c) => c.id === courseId);
      if (course) {
        setParticipations([
          ...participations,
          { id: data.participant.id, role: data.participant.role, course: { ...course, jour: null, heureDebut: null, heureFin: null } },
        ]);
      }
      setCourseId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeParticipation(p: ParticipationRow) {
    if (!confirm(`Retirer cette personne du cours « ${p.course.nomCours} » ?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/courses/${p.course.id}/participants/${p.id}`, { method: "DELETE" });
      setParticipations(participations.filter((x) => x.id !== p.id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {participations.length === 0 ? (
        <p className="muted">Aucune intervention rattachée.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Cours</th>
                <th>Rôle</th>
                <th>Jour</th>
                <th>Horaire</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {participations.map((p) => (
                <tr key={p.id}>
                  <td className="muted">{p.course.code}</td>
                  <td>
                    <Link href={`/admin/cours/${p.course.id}`}>{p.course.nomCours}</Link>
                  </td>
                  <td>
                    <span className="badge info">{ROLE_LABELS[p.role]}</span>
                  </td>
                  <td>{p.course.jour ?? "—"}</td>
                  <td>{p.course.heureDebut ? `${p.course.heureDebut} – ${p.course.heureFin ?? ""}` : "—"}</td>
                  {canEdit && (
                    <td>
                      <button className="btn danger small" disabled={busy} onClick={() => removeParticipation(p)}>
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
        <form onSubmit={addParticipation} style={{ marginTop: 14 }}>
          {error && <div className="error-msg">{error}</div>}
          <div className="btn-row">
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">— Ajouter une intervention sur un cours —</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code})
                </option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
              <option value="MUSICIEN">Musicien·ne</option>
              <option value="CO_ENSEIGNANT">Co-enseignant·e</option>
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
