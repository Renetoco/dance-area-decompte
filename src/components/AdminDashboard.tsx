"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Role = "ADMIN" | "COMPTABILITE" | "DIRECTION" | "SECRETARIAT";

type TeacherLite = {
  id: string;
  name: string;
  analyticCode: string;
  email: string | null;
  role: "ENSEIGNANT" | "MUSICIEN";
};

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

const TEACHER_ROLE_LABELS: Record<string, string> = {
  ENSEIGNANT: "Prof",
  MUSICIEN: "Musicien·ne",
};

// Tri des colonnes du tableau (demande de Rene du 22.09.2026) : cliquer sur
// un en-tête trie/regroupe toutes les déclarations affichées selon cette
// colonne (un 2e clic inverse le sens), en plus des filtres existants
// (période, statut, changements, recherche, type de compte) qui, eux,
// réduisent la liste plutôt que de la réordonner.
type SortKey = "teacher" | "type" | "status" | "hasChanges" | "submittedAt" | "items";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { DRAFT: 0, SUBMITTED_MANUAL: 1, SUBMITTED_AUTO: 2 };
const TEACHER_ROLE_ORDER: Record<string, number> = { ENSEIGNANT: 0, MUSICIEN: 1 };

function compareDeclarations(a: DeclarationRow, b: DeclarationRow, key: SortKey): number {
  const byName = () => a.teacher.name.localeCompare(b.teacher.name, "fr");
  switch (key) {
    case "teacher":
      return byName();
    case "type":
      return (TEACHER_ROLE_ORDER[a.teacher.role] ?? 0) - (TEACHER_ROLE_ORDER[b.teacher.role] ?? 0) || byName();
    case "status":
      return (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0) || byName();
    case "hasChanges": {
      const val = (d: DeclarationRow) => (d.hasChanges === null ? -1 : d.hasChanges ? 1 : 0);
      return val(a) - val(b) || byName();
    }
    case "submittedAt": {
      const time = (d: DeclarationRow) => (d.submittedAt ? new Date(d.submittedAt).getTime() : -Infinity);
      return time(a) - time(b) || byName();
    }
    case "items":
      return a.items.length - b.items.length || byName();
  }
}

function defaultPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminDashboard() {
  const [role, setRole] = useState<Role | null>(null);
  const [period, setPeriod] = useState(defaultPeriod());
  const [status, setStatus] = useState("");
  const [hasChanges, setHasChanges] = useState("");
  const [teacherRole, setTeacherRole] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("teacher");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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
      if (teacherRole) params.set("teacherRole", teacherRole);
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
  }, [period, status, hasChanges, teacherRole, q]);

  // Tri d'affichage (voir compareDeclarations) — s'applique après les
  // filtres ci-dessus, sur la liste déjà reçue de l'API.
  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortBy !== key) return null;
    return <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  }

  const sortedDeclarations = [...declarations].sort((a, b) => {
    const cmp = compareDeclarations(a, b, sortBy);
    return sortDir === "asc" ? cmp : -cmp;
  });

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
  // Triés par nom pour un sélecteur d'export lisible, indépendamment de
  // l'ordre du tableau ou de la liste "sans déclaration".
  const allActiveTeachers = [...declarations.map((d) => d.teacher), ...missing].sort((a, b) =>
    a.name.localeCompare(b.name, "fr")
  );
  const allActiveIds = allActiveTeachers.map((t) => t.id);

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

  const canExport = role === "ADMIN" || role === "COMPTABILITE" || role === "DIRECTION" || role === "SECRETARIAT";

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
        <select value={teacherRole} onChange={(e) => setTeacherRole(e.target.value)}>
          <option value="">Tous les comptes</option>
          <option value="ENSEIGNANT">Profs</option>
          <option value="MUSICIEN">Musicien·nes</option>
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

      {canExport && allActiveTeachers.length > 0 && (
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Sélectionner les profs à exporter</h3>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700 }}>
              <input type="checkbox" checked={selected.size === allActiveIds.length} onChange={toggleSelectAll} />
              Tout sélectionner ({allActiveTeachers.length})
            </label>
          </div>
          <p className="muted" style={{ marginTop: 0, marginBottom: 10, fontSize: "0.85rem" }}>
            {selected.size} prof{selected.size !== 1 ? "s" : ""} sélectionné{selected.size !== 1 ? "s" : ""} pour «
            Exporter la sélection ».
          </p>
          <div className="teacher-picker">
            {allActiveTeachers.map((t) => (
              <label key={t.id} className={`teacher-picker-item ${selected.has(t.id) ? "checked" : ""}`}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        </div>
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
              <th></th>
              <th className="th-sortable" onClick={() => handleSort("teacher")}>
                Prof{sortIndicator("teacher")}
              </th>
              <th>Code</th>
              <th className="th-sortable" onClick={() => handleSort("type")}>
                Type{sortIndicator("type")}
              </th>
              <th className="th-sortable" onClick={() => handleSort("status")}>
                Statut{sortIndicator("status")}
              </th>
              <th className="th-sortable" onClick={() => handleSort("hasChanges")}>
                Changements{sortIndicator("hasChanges")}
              </th>
              <th className="th-sortable" onClick={() => handleSort("submittedAt")}>
                Soumis le{sortIndicator("submittedAt")}
              </th>
              <th className="th-sortable" onClick={() => handleSort("items")}>
                Lignes{sortIndicator("items")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDeclarations.map((d) => (
              <Fragment key={d.id}>
                <tr className="is-clickable" onClick={() => toggleExpand(d.id)}>
                  <td>{expanded === d.id ? "▾" : "▸"}</td>
                  <td>
                    <Link href={`/admin/profs/${d.teacher.id}`} onClick={(e) => e.stopPropagation()}>
                      {d.teacher.name}
                    </Link>
                  </td>
                  <td>{d.teacher.analyticCode}</td>
                  <td>{TEACHER_ROLE_LABELS[d.teacher.role] ?? d.teacher.role}</td>
                  <td>
                    <span className={`badge ${STATUS_LABELS[d.status].cls}`}>{STATUS_LABELS[d.status].label}</span>
                  </td>
                  <td>{d.hasChanges == null ? "—" : d.hasChanges ? "Oui" : "Non"}</td>
                  <td>{d.submittedAt ? new Date(d.submittedAt).toLocaleString("fr-CH") : "—"}</td>
                  <td>{d.items.length}</td>
                </tr>
                {expanded === d.id && detail && (
                  <tr className="detail-row">
                    <td colSpan={8}>
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
