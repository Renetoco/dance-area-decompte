"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ParticipantRole = "MUSICIEN" | "CO_ENSEIGNANT";

type Participant = {
  id: string;
  role: ParticipantRole;
  teacher: { id: string; name: string; role: "ENSEIGNANT" | "MUSICIEN" };
};

type TeacherOption = { id: string; name: string; role: "ENSEIGNANT" | "MUSICIEN" };

const ROLE_LABELS: Record<ParticipantRole, string> = {
  MUSICIEN: "Musicien·ne",
  CO_ENSEIGNANT: "Co-enseignant·e",
};

export default function CourseParticipants({
  courseId,
  initialParticipants,
  teachers,
  canEdit,
}: {
  courseId: string;
  initialParticipants: Participant[];
  teachers: TeacherOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [teacherId, setTeacherId] = useState("");
  const [role, setRole] = useState<ParticipantRole>("MUSICIEN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = teachers.filter((t) => !participants.some((p) => p.teacher.id === t.id));

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId) return;
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
      setParticipants([...participants, data.participant]);
      setTeacherId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeParticipant(id: string) {
    if (!confirm("Retirer cette personne de ce cours ?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/courses/${courseId}/participants/${id}`, { method: "DELETE" });
      setParticipants(participants.filter((p) => p.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {participants.length === 0 ? (
        <p className="muted">Aucun·e musicien·ne ou co-enseignant·e rattaché·e pour l'instant.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle sur ce cours</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/profs/${p.teacher.id}`}>{p.teacher.name}</Link>
                  </td>
                  <td>
                    <span className="badge info">{ROLE_LABELS[p.role]}</span>
                  </td>
                  {canEdit && (
                    <td>
                      <button className="btn danger small" disabled={busy} onClick={() => removeParticipant(p.id)}>
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
        <form onSubmit={addParticipant} style={{ marginTop: 14 }}>
          {error && <div className="error-msg">{error}</div>}
          <div className="btn-row">
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">— Ajouter une personne —</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.role === "MUSICIEN" ? "(musicien·ne)" : ""}
                </option>
              ))}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
              <option value="MUSICIEN">Musicien·ne</option>
              <option value="CO_ENSEIGNANT">Co-enseignant·e</option>
            </select>
            <button className="btn small" disabled={busy || !teacherId}>
              Ajouter
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
