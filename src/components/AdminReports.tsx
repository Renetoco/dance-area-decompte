"use client";

import { useEffect, useState } from "react";

type PeriodRow = {
  period: string;
  verrouillage: string | null; // generatedAt ISO, ou null si pas encore archivé
  final: string | null;
};

// "2026-09" -> "Septembre 2026"
function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const label = date.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function AdminReports() {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/reports")
      .then((res) => res.json())
      .then((data) => setPeriods(data.periods ?? []))
      .finally(() => setLoading(false));
  }, []);

  function downloadUrl(period: string, kind: "verrouillage" | "final") {
    return `/api/admin/reports/download?period=${period}&kind=${kind}`;
  }

  return (
    <div>
      <p className="muted" style={{ maxWidth: 640 }}>
        Chaque mois, l'application archive automatiquement deux rapports Excel tels qu'ils ont été envoyés par
        email : celui du verrouillage (le 20, à la date limite) et le résumé final (le 26, entrées tardives
        incluses). Ce sont des instantanés — retélécharger ici donne exactement ce qui a été envoyé ce jour-là,
        pas un recalcul à partir des données actuelles.
      </p>

      {loading ? (
        <p className="muted">Chargement...</p>
      ) : periods.length === 0 ? (
        <p className="muted">Aucun rapport archivé pour l'instant — le premier apparaîtra après la prochaine clôture.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Période</th>
                <th>Verrouillage (20)</th>
                <th>Résumé final (26)</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.period}>
                  <td style={{ fontWeight: 600 }}>{formatPeriodLabel(p.period)}</td>
                  <td>
                    {p.verrouillage ? (
                      <a className="btn small secondary" href={downloadUrl(p.period, "verrouillage")}>
                        Télécharger (Excel)
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {p.final ? (
                      <a className="btn small secondary" href={downloadUrl(p.period, "final")}>
                        Télécharger (Excel)
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
