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
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        setSelected(new Set()); // la sélection ne survit pas à un changement de filtre
      }
    } finally {
      setLoading(false);
    }
  }, [period, status, hasChanges, q]);

  function toggleSelected(teacherId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  // Tous les profs dont le compte est actif pour cette période : ceux qui
  // ont déjà une déclaration (tableau principal) + ceux qui n'en ont pas
  // encore (liste "sans déclaration" plus bas) — voir /api/admin/declarations
  // où `missingTeachers` est déjà défini comme "profs actifs sans déclaration".
  const allActiveIds = [...declarations.map((d) => d.teacher.id), ...missing.map((t) => t.id)];

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === allActiveIds.length ? new Set() : new Set(allActiveIds)));
  }

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

  const canExport = role === "ADMIN" || role === "COMPTABILITE";

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
        {canExport && (
          <a className="btn small" href={`/api/admin/export-xlsx?period=${period}`}>
            Exporter tout (Excel)
          </a>
        )}
        {canExport && (
          <button
            type="button"
            className="btn small secondary"
            disabled={selected.size === 0}
            title={selected.size === 0 ? "Cochez au moins un prof ci-dessous" : undefined}
            onClick={() => {
              const params = new URLSearchParams({ period, teacherIds: Array.from(selected).join(",") });
              window.location.href = `/api/admin/export-xlsx?${params}`;
            }}
          >
            Exporter la sélection ({selected.size}) (Excel)
          </button>
        )}
      </div>

      {canExport && allActiveIds.length > 0 && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.85rem",
            margin: "8px 0 0",
          }}
        >
          <input
            type="checkbox"
            checked={selected.size === allActiveIds.length}
            onChange={toggleSelectAll}
          />
          Tout sélectionner ({allActiveIds.length} profs actifs)
        </label>
      )}

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
              {canExport && <th></th>}
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
                  {canExport && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(d.teacher.id)}
                        onChange={() => toggleSelected(d.teacher.id)}
                      />
                    </td>
                  )}
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
                    <td colSpan={canExport ? 8 : 7}>
                      {detail.items.length === 0 && <p className="muted">Aucune ligne de changement.</p>}
                      {detail.items.map((item: any) => (
                        <div key={item.id} className="detail-item">
                          <strong>{TYPE_LABELS[item.type]}</strong>
                          {item.course ? ` — ${item.course.nomCours} (${item.course.code})` : ""}
                          {item.date ? ` — ${item.date.slice(0, 10)}` : ""}
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
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "8px 0 0",
              display: "flex",
              flexWrap: "wrap",
              columnGap: 16,
              rowGap: 4,
            }}
          >
            {missing.map((t) => (
              <li key={t.id} className="muted" style={{ fontSize: "0.85rem" }}>
                {canExport && (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelected(t.id)}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Link href={`/admin/profs/${t.id}`}>{t.name}</Link>
              </li>
            ))}
          </ul>
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
