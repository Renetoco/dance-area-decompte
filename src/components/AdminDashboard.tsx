"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Role = "ADMIN" | "COMPTABILITE" | "DIRECTION";

type TeacherLite = { id: string; name: string; analyticCode: string; email: string | null };

type DeclarationRow = {
  id: string;
  period: string;
  status: "DRAFT" | "SUBMITTED_MANUAL" | "SUBMITTED_AUTO";
  hasChanges: boolean | null;
  submittedAt: string | null;
  teacher: TeacherLite;
  items: { id: string }[];
};

type Summary = {
  total: number;
  soumisManuel: number;
  soumisAuto: number;
  pasEncoreSoumis: number;
  avecChangements: number;
  sansChangements: number;
  totalCourses: number;
  coursesGiven: number;
  coursesWithChanges: number;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Non soumis", cls: "warning" },
  SUBMITTED_MANUAL: { label: "Soumis", cls: "success" },
  SUBMITTED_AUTO: { label: "Auto-soumis", cls: "neutral" },
};

const CONCORDANCE_LABELS: Record<string, { label: string; cls: string }> = {
  CONCORDANT: { label: "🟢 Concordant", cls: "success" },
  DISCORDANT: { label: "🔴 Discordant", cls: "danger" },
  EN_ATTENTE: { label: "🟠 En attente de l'autre prof", cls: "warning" },
  NON_VERIFIABLE: { label: "⚪ Non vérifiable", cls: "neutral" },
  NON_APPLICABLE: { label: "", cls: "neutral" },
};

const TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué",
  ABSENCE_REMPLACEE: "Absence remplacée",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre",
};

function defaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminDashboard() {
  const [role, setRole] = useState<Role | null>(null);
  const [period, setPeriod] = useState(defaultPeriod());
  const [status, setStatus] = useState("");
  const [hasChanges, setHasChanges] = useState("");
  const [q, setQ] = useState("");
  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  const [missing, setMissing] = useState<TeacherLite[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (status) params.set("status", status);
      if (hasChanges) params.set("hasChanges", hasChanges);
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/declarations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDeclarations(data.declarations);
        setMissing(data.missingTeachers);
        setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [period, status, hasChanges, q]);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setRole(d.role));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    const res = await fetch(`/api/admin/declarations/${id}`);
    if (res.ok) setDetail((await res.json()).declaration);
  }

  const canExportCsv = role === "ADMIN" || role === "COMPTABILITE";

  return (
    <div>
      <div className="filters">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="DRAFT">Non soumis</option>
          <option value="SUBMITTED_MANUAL">Soumis</option>
          <option value="SUBMITTED_AUTO">Auto-soumis</option>
        </select>
        <select value={hasChanges} onChange={(e) => setHasChanges(e.target.value)}>
          <option value="">Changements ou non</option>
          <option value="true">Avec changements</option>
          <option value="false">Sans changement</option>
        </select>
        <input placeholder="Rechercher un prof..." value={q} onChange={(e) => setQ(e.target.value)} />
        {canExportCsv && (
          <a className="btn small" href={`/api/admin/export-csv?period=${period}`}>
            Exporter le CSV
          </a>
        )}
      </div>

      {summary && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            Aperçu — cours et professeurs
          </h3>
          <MetricBars summary={summary} />
        </div>
      )}

      {summary && (
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="value">{summary.total}</div>
            <div className="label">Profs actifs</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summary.soumisManuel}</div>
            <div className="label">Soumis manuellement</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summary.soumisAuto}</div>
            <div className="label">Auto-soumis</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summary.pasEncoreSoumis}</div>
            <div className="label">Pas encore soumis</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summary.avecChangements}</div>
            <div className="label">Avec changements</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summary.sansChangements}</div>
            <div className="label">Rien n'a changé</div>
          </div>
        </div>
      )}

      {loading && <p className="muted">Chargement...</p>}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Prof</th>
              <th>Code</th>
              <th>Statut</th>
              <th>Changements</th>
              <th>Soumis le</th>
              <th>Lignes</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d) => (
              <Fragment key={d.id}>
                <tr className="is-clickable" onClick={() => toggleExpand(d.id)}>
                  <td>{expanded === d.id ? "▾" : "▸"}</td>
                  <td>
                    <Link href={`/admin/profs/${d.teacher.id}`} onClick={(e) => e.stopPropagation()}>
                      {d.teacher.name}
                    </Link>
                  </td>
                  <td>{d.teacher.analyticCode}</td>
                  <td>
                    <span className={`badge ${STATUS_LABELS[d.status].cls}`}>{STATUS_LABELS[d.status].label}</span>
                  </td>
                  <td>{d.hasChanges == null ? "—" : d.hasChanges ? "Oui" : "Non"}</td>
                  <td>{d.submittedAt ? new Date(d.submittedAt).toLocaleString("fr-CH") : "—"}</td>
                  <td>{d.items.length}</td>
                </tr>
                {expanded === d.id && detail && (
                  <tr className="detail-row">
                    <td colSpan={7}>
                      {detail.items.length === 0 && <p className="muted">Aucune ligne de changement.</p>}
                      {detail.items.map((item: any) => (
                        <div key={item.id} className="detail-item">
                          <strong>{TYPE_LABELS[item.type]}</strong>
                          {item.course ? ` — ${item.course.nomCours} (${item.course.code})` : ""}
                          {item.date ? ` — ${item.date.slice(0, 10)}` : ""}
                          {item.hours != null ? ` — ${item.hours}h` : ""}
                          {item.otherTeacher ? ` — avec ${item.otherTeacher.name}` : item.otherTeacherFreeText ? ` — avec ${item.otherTeacherFreeText}` : ""}
                          {item.comment ? ` — "${item.comment}"` : ""}
                          {item.concordance?.status !== "NON_APPLICABLE" && (
                            <div>
                              <span className={`badge ${CONCORDANCE_LABELS[item.concordance.status].cls}`}>
                                {CONCORDANCE_LABELS[item.concordance.status].label}
                              </span>{" "}
                              <span className="muted" style={{ fontSize: "0.8rem" }}>
                                {item.concordance.detail}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontWeight: 600, margin: 0 }}>
            Professeurs sans déclaration pour cette période ({missing.length})
          </p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {missing.map((t, i) => (
              <span key={t.id}>
                <Link href={`/admin/profs/${t.id}`}>{t.name}</Link>
                {i < missing.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricBars({ summary }: { summary: Summary }) {
  const rows = [
    { label: "Cours au programme", value: summary.totalCourses, color: "var(--accent-2)" },
    { label: "Professeurs actifs", value: summary.total, color: "var(--accent)" },
    { label: "Cours donnés", value: summary.coursesGiven, color: "var(--ok-fg)" },
    { label: "Cours avec changements", value: summary.coursesWithChanges, color: "var(--warn-fg)" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="metric-bars">
      {rows.map((r) => (
        <div className="metric-bar-row" key={r.label}>
          <span className="label">{r.label}</span>
          <span className="track">
            <span className="fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
