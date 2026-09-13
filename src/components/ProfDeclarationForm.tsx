"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ChangeType = "REMPLACEMENT_EFFECTUE" | "ABSENCE_REMPLACEE" | "ABSENCE_NON_REMPLACEE" | "AUTRE";
type DeclarationStatus = "DRAFT" | "SUBMITTED_MANUAL" | "SUBMITTED_AUTO";

const TYPE_LABELS: Record<ChangeType, string> = {
  REMPLACEMENT_EFFECTUE: "J'ai remplacé un·e collègue",
  ABSENCE_REMPLACEE: "J'ai été absent·e, remplacé·e par quelqu'un",
  ABSENCE_NON_REMPLACEE: "J'ai été absent·e, cours non remplacé",
  AUTRE: "Autre changement",
};

type Course = {
  id: string;
  code: string;
  nomCours: string;
  jour: string | null;
  heureDebut: string | null;
  heureFin: string | null;
};

type Teacher = { id: string; name: string };

type Item = {
  id: string;
  type: ChangeType;
  courseId: string | null;
  course: Course | null;
  date: string | null;
  otherTeacherId: string | null;
  otherTeacher: Teacher | null;
  otherTeacherFreeText: string | null;
  hours: number | null;
  comment: string | null;
};

type Declaration = {
  id: string;
  hasChanges: boolean | null;
  status: DeclarationStatus;
  submittedAt: string | null;
  items: Item[];
};

export type Bundle = {
  teacher: { id: string; name: string; email: string | null };
  period: string;
  periodLabel: string;
  deadlineLabel: string;
  locked: boolean;
  declaration: Declaration;
  myCourses: Course[];
  otherCourses: Course[];
  teachers: Teacher[];
};

const STATUS_BADGE: Record<DeclarationStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Brouillon — pas encore soumis", cls: "warning" },
  SUBMITTED_MANUAL: { label: "Envoyée", cls: "success" },
  SUBMITTED_AUTO: { label: "Envoyée automatiquement (délai dépassé)", cls: "neutral" },
};

/**
 * Calcule la durée d'un cours (en heures, ex. 1.25) à partir de ses horaires
 * "HH:MM" — sert à pré-remplir le champ Heures dès qu'un cours est
 * sélectionné, pour éviter au prof de le recalculer à la main. Renvoie
 * null si le cours n'a pas d'horaire défini (ex. "packs" Etudes/SAE).
 */
function dureeCoursEnHeures(course: Course | null | undefined): number | null {
  if (!course || !course.heureDebut || !course.heureFin) return null;
  const [h1, m1] = course.heureDebut.split(":").map(Number);
  const [h2, m2] = course.heureFin.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null;
  let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diffMinutes <= 0) diffMinutes += 24 * 60; // cas rare, passage après minuit
  return Math.round((diffMinutes / 60) * 100) / 100;
}

const emptyForm = {
  type: "REMPLACEMENT_EFFECTUE" as ChangeType,
  courseId: "",
  date: "",
  otherTeacherId: "",
  otherTeacherFreeText: "",
  hours: "",
  comment: "",
};

export default function ProfDeclarationForm({ initialBundle }: { initialBundle: Bundle }) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initialBundle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<string | null>(null); // "new" | item id | null
  const [form, setForm] = useState(emptyForm);

  const { declaration, locked } = bundle;

  async function refresh() {
    const res = await fetch("/api/declarations");
    if (res.ok) setBundle(await res.json());
  }

  async function handleHasChanges(value: boolean) {
    if (value === false && declaration.items.length > 0) {
      if (!confirm("Cela supprimera les changements déjà saisis. Continuer ?")) return;
    }
    // Dès qu'on répond « Oui » pour la première fois (aucun changement
    // saisi pour l'instant), on ouvre directement le formulaire d'ajout —
    // évite le clic supplémentaire sur « + Ajouter un changement ».
    const openFormAfter = value === true && declaration.items.length === 0;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/declarations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasChanges: value }),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      await refresh();
      if (openFormAfter) {
        setForm(emptyForm);
        setShowForm("new");
      }
    } finally {
      setBusy(false);
    }
  }

  function openNewForm() {
    setForm(emptyForm);
    setShowForm("new");
  }

  function openEditForm(item: Item) {
    setForm({
      type: item.type,
      courseId: item.courseId ?? "",
      date: item.date ? item.date.slice(0, 10) : "",
      otherTeacherId: item.otherTeacherId ?? "",
      otherTeacherFreeText: item.otherTeacherFreeText ?? "",
      hours: item.hours != null ? String(item.hours) : "",
      comment: item.comment ?? "",
    });
    setShowForm(item.id);
  }

  async function saveItem() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        type: form.type,
        courseId: form.courseId || null,
        date: form.date || null,
        otherTeacherId: form.otherTeacherId || null,
        otherTeacherFreeText: form.otherTeacherId ? null : form.otherTeacherFreeText || null,
        hours: form.hours || null,
        comment: form.comment || null,
      };
      const url = showForm === "new" ? "/api/declarations/items" : `/api/declarations/items/${showForm}`;
      const method = showForm === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      setShowForm(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Supprimer cette ligne ?")) return;
    setBusy(true);
    try {
      await fetch(`/api/declarations/items/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitDeclaration() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/declarations/submit", { method: "POST" });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/connexion");
    router.refresh();
  }

  const allCourses = [...bundle.myCourses, ...bundle.otherCourses];
  const isSubmitted = declaration.status === "SUBMITTED_MANUAL";
  const canEdit = !locked;

  return (
    <main className="page">
      <div className="top-bar">
        <div>
          <h1>Bonjour {bundle.teacher.name.split(" ")[0]}</h1>
          <p className="muted">Période : {bundle.periodLabel}</p>
        </div>
        <button className="btn secondary small" onClick={logout}>
          Se déconnecter
        </button>
      </div>

      <div className="card">
        <span className={`badge ${STATUS_BADGE[declaration.status].cls}`}>
          {STATUS_BADGE[declaration.status].label}
        </span>
        <p className="muted" style={{ marginTop: 8 }}>
          {locked
            ? "La période est close, votre décompte est en lecture seule."
            : `Vous pouvez encore modifier votre déclaration jusqu'au ${bundle.deadlineLabel}.`}
        </p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {declaration.hasChanges === true && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Changements déclarés ce mois-ci</h2>
          {declaration.items.length === 0 && showForm !== "new" && (
            <p className="muted">Aucun changement ajouté pour l'instant.</p>
          )}
          {declaration.items.map((item) => (
            <div key={item.id} className="card nested">
              <p style={{ fontWeight: 600, margin: 0 }}>{TYPE_LABELS[item.type]}</p>
              {item.course && (
                <p className="muted" style={{ margin: "4px 0" }}>
                  Cours : {item.course.nomCours} ({item.course.code})
                  {item.course.jour ? ` — ${item.course.jour} ${item.course.heureDebut ?? ""}` : ""}
                </p>
              )}
              {item.date && <p className="muted" style={{ margin: "4px 0" }}>Date : {item.date.slice(0, 10)}</p>}
              {(item.otherTeacher || item.otherTeacherFreeText) && (
                <p className="muted" style={{ margin: "4px 0" }}>
                  Autre prof : {item.otherTeacher?.name ?? item.otherTeacherFreeText}
                </p>
              )}
              {item.hours != null && <p className="muted" style={{ margin: "4px 0" }}>Heures : {item.hours}</p>}
              {item.comment && <p className="muted" style={{ margin: "4px 0" }}>Commentaire : {item.comment}</p>}
              {canEdit && (
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn secondary small" onClick={() => openEditForm(item)}>
                    Modifier
                  </button>
                  <button className="btn danger small" onClick={() => deleteItem(item.id)}>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}

          {canEdit && showForm !== "new" && (
            <button className="btn secondary" onClick={openNewForm}>
              + Ajouter un changement
            </button>
          )}
        </div>
      )}

      <div className="card">
        <p style={{ fontWeight: 700, fontSize: "1.05rem", marginTop: 0 }}>Avez-vous eu des changements ce mois-ci ?</p>
        <div className="segmented">
          <button
            type="button"
            className={`seg ${declaration.hasChanges === false ? "selected" : ""}`}
            disabled={!canEdit || busy}
            onClick={() => handleHasChanges(false)}
          >
            Non, rien n'a changé
          </button>
          <button
            type="button"
            className={`seg ${declaration.hasChanges === true ? "selected" : ""}`}
            disabled={!canEdit || busy}
            onClick={() => handleHasChanges(true)}
          >
            Oui, il y a eu des changements
          </button>
        </div>
      </div>

      {canEdit && showForm && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{showForm === "new" ? "Nouveau changement" : "Modifier le changement"}</h2>

          <label>Type de changement</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChangeType })}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label>Cours concerné</label>
          <select
            value={form.courseId}
            onChange={(e) => {
              const courseId = e.target.value;
              const course = allCourses.find((c) => c.id === courseId) ?? null;
              const dureeAuto = dureeCoursEnHeures(course);
              setForm({
                ...form,
                courseId,
                // Pré-rempli automatiquement selon l'horaire du cours choisi ;
                // reste modifiable si la durée réelle a été différente.
                hours: dureeAuto != null ? String(dureeAuto) : form.hours,
              });
            }}
          >
            <option value="">— Sélectionner —</option>
            <optgroup label="Vos cours">
              {bundle.myCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code}) {c.jour ? `— ${c.jour} ${c.heureDebut ?? ""}` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Autres cours de l'école">
              {bundle.otherCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code}) {c.jour ? `— ${c.jour} ${c.heureDebut ?? ""}` : ""}
                </option>
              ))}
            </optgroup>
          </select>

          <label>Date</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />

          <label>Autre prof concerné (qui a remplacé / qui a été remplacé)</label>
          <select
            value={form.otherTeacherId}
            onChange={(e) => setForm({ ...form, otherTeacherId: e.target.value })}
          >
            <option value="">— Non applicable / voir ci-dessous —</option>
            {bundle.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!form.otherTeacherId && (
            <input
              placeholder="Ou nom en texte libre (ex. remplaçant·e externe)"
              value={form.otherTeacherFreeText}
              onChange={(e) => setForm({ ...form, otherTeacherFreeText: e.target.value })}
              style={{ marginTop: 6 }}
            />
          )}

          <label>
            Heures{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              (pré-rempli selon l'horaire du cours choisi, modifiable)
            </span>
          </label>
          <input
            type="number"
            step="0.25"
            min="0"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
          />

          <label>Commentaire (facultatif)</label>
          <textarea
            rows={3}
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn secondary" onClick={() => setShowForm(null)} disabled={busy}>
              Annuler
            </button>
            <button className="btn" onClick={saveItem} disabled={busy}>
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {canEdit && declaration.hasChanges !== null && (
        <button
          className="btn"
          onClick={submitDeclaration}
          disabled={busy || isSubmitted || (declaration.hasChanges === true && declaration.items.length === 0)}
        >
          {isSubmitted ? "Déjà envoyée ✓" : "Envoyer ma déclaration"}
        </button>
      )}
      {declaration.hasChanges === true && declaration.items.length === 0 && canEdit && (
        <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>
          Ajoutez au moins un changement, ou choisissez « Non, rien n'a changé » ci-dessus.
        </p>
      )}

      <details className="card">
        <summary style={{ fontWeight: 700, fontSize: "1.05rem", cursor: "pointer" }}>Vos cours ce mois-ci</summary>
        <div style={{ marginTop: 12 }}>
          {bundle.myCourses.length === 0 ? (
            <p className="muted">Aucun cours ne vous est rattaché comme titulaire pour l'instant.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bundle.myCourses.map((c) => (
                <li
                  key={c.id}
                  style={{
                    padding: "8px 0",
                    borderTop: "1px solid var(--glass-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    {c.nomCours} <span className="muted">({c.code})</span>
                  </span>
                  <span className="muted">
                    {c.jour ? `${c.jour}${c.heureDebut ? ` — ${c.heureDebut}${c.heureFin ? `–${c.heureFin}` : ""}` : ""}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <p style={{ textAlign: "center", marginTop: 24 }}>
        <a href="/prof/historique">Voir l'historique de mes décomptes</a>
      </p>
    </main>
  );
}
