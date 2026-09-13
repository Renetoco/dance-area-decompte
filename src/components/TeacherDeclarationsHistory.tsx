"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPeriodLabel } from "@/lib/dates";

type DeclarationRow = {
  id: string;
  period: string;
  status: "DRAFT" | "SUBMITTED_MANUAL" | "SUBMITTED_AUTO";
  hasChanges: boolean | null;
  submittedAt: string | Date | null;
  _count: { items: number };
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Non soumis", cls: "warning" },
  SUBMITTED_MANUAL: { label: "Soumis", cls: "success" },
  SUBMITTED_AUTO: { label: "Auto-soumis", cls: "neutral" },
};

/**
 * Historique des déclarations d'un prof, avec un bouton "Effacer" (double
 * confirmation) — sert par exemple à effacer une déclaration de test avant
 * une présentation, ou une saisie faite par erreur. La déclaration est
 * recréée vierge automatiquement au prochain passage du prof sur son écran.
 */
export default function TeacherDeclarationsHistory({ declarations }: { declarations: DeclarationRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function effacer(d: DeclarationRow) {
    if (confirmId !== d.id) {
      setConfirmId(d.id);
      return;
    }
    setBusyId(d.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/declarations/${d.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Échec de la suppression.");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  if (declarations.length === 0) {
    return <p className="muted">Aucune déclaration pour l'instant.</p>;
  }

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Période</th>
              <th>Statut</th>
              <th>Changements</th>
              <th>Soumis le</th>
              <th>Lignes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d) => (
              <tr key={d.id}>
                <td>{formatPeriodLabel(d.period)}</td>
                <td>
                  <span className={`badge ${STATUS_LABELS[d.status].cls}`}>{STATUS_LABELS[d.status].label}</span>
                </td>
                <td>{d.hasChanges == null ? "—" : d.hasChanges ? "Oui" : "Non"}</td>
                <td>{d.submittedAt ? new Date(d.submittedAt).toLocaleString("fr-CH") : "—"}</td>
                <td>{d._count.items}</td>
                <td>
                  <div className="btn-row">
                    <button
                      className="btn danger small"
                      disabled={busyId === d.id}
                      onClick={() => effacer(d)}
                      title="Efface complètement cette déclaration (ex. test) — elle sera recréée vierge"
                    >
                      {confirmId === d.id ? "Confirmer l'effacement ?" : "Effacer"}
                    </button>
                    {confirmId === d.id && (
                      <button className="btn secondary small" onClick={() => setConfirmId(null)}>
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
    </div>
  );
}
