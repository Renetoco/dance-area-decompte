"use client";

import { useEffect, useState } from "react";

type LogEntry = {
  id: string;
  adminName: string;
  adminRole: "ADMIN" | "COMPTABILITE" | "DIRECTION";
  description: string;
  createdAt: string;
};

const ROLE_LABELS: Record<LogEntry["adminRole"], string> = {
  ADMIN: "Administrateur",
  COMPTABILITE: "Comptabilité",
  DIRECTION: "Direction",
};

export default function AdminJournal() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/journal?limit=${limit}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div>
      <p className="muted">
        Cours, profs, musicien·nes et comptes backend — les {entries.length} action(s) la/les plus récente(s)
        {total > entries.length ? ` sur ${total} au total` : ""}.
      </p>
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="muted">Aucune action enregistrée pour l'instant.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Compte</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.createdAt).toLocaleString("fr-CH")}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {e.adminName} <span className="muted">({ROLE_LABELS[e.adminRole]})</span>
                  </td>
                  <td>{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > entries.length && (
        <div style={{ marginTop: 12 }}>
          <button className="btn secondary small" onClick={() => setLimit(limit + 200)} disabled={loading}>
            Voir plus
          </button>
        </div>
      )}
    </div>
  );
}
