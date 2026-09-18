"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { occurrenceDatesInPeriod } from "@/lib/dates";

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
  teacher?: { id: string; name: string } | null;
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
  comment: string | null;
  tardif: boolean;
};

type AjbLateEntryT = {
  id: string;
  date: string | null;
  heure: string | null;
  nomCours: string;
  comment: string | null;
};

type Declaration = {
  id: string;
  hasChanges: boolean | null;
  status: DeclarationStatus;
  submittedAt: string | null;
  items: Item[];
  ajbCourseCount: number | null;
  ajbLateEntries: AjbLateEntryT[];
};

export type Bundle = {
  teacher: { id: string; name: string; email: string | null };
  period: string;
  periodLabel: string;
  deadlineLabel: string;
  locked: boolean;
  lateWindowOpen: boolean;
  lateWindowEndLabel: string;
  isAjbTeacher: boolean;
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
 * Devine la date la plus probable d'une séance du cours choisi, au sein de
 * la période en cours (27 du mois précédent au 26 du mois de la période) —
 * cherche toutes les occurrences du jour de la semaine du cours dans cette
 * fenêtre, et retient celle la plus proche d'aujourd'hui (avant ou après).
 * Reste modifiable ensuite ; renvoie null si le cours n'a pas de jour fixe
 * (ex. "packs" Etudes/SAE).
 */
function dateAutoPourCours(course: Course | null | undefined, period: string): string | null {
  if (!course || !course.jour) return null;
  const dates = occurrenceDatesInPeriod(course.jour, period);
  if (dates.length === 0) return null;

  const aujourdhui = new Date();
  let meilleure: { date: string; ecart: number } | null = null;
  for (const d of dates) {
    const candidat = new Date(`${d}T00:00:00`);
    const ecart = Math.abs(candidat.getTime() - aujourdhui.getTime());
    if (!meilleure || ecart < meilleure.ecart) meilleure = { date: d, ecart };
  }
  return meilleure ? meilleure.date : null;
}

const emptyForm = {
  type: "REMPLACEMENT_EFFECTUE" as ChangeType,
  courseId: "",
  date: "",
  otherTeacherId: "",
  otherTeacherFreeText: "",
  comment: "",
};

export default function ProfDeclarationForm({ initialBundle }: { initialBundle: Bundle }) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initialBundle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<string | null>(null); // "new" | item id | null
  const [form, setForm] = useState(emptyForm);
  // Message de confirmation affiché juste après l'envoi d'un changement
  // tardif (demande de Rene du 17.09.2026) — reste visible tant que le prof
  // ne l'a pas fermé, pour être sûr qu'il/elle le voie.
  const [lateConfirmationVisible, setLateConfirmationVisible] = useState(false);
  // Champ "cours AJB donnés" (demande de Rene du 18.09.2026) — brouillon
  // local tant que le prof n'a pas cliqué sur "Enregistrer", pour ne pas
  // envoyer une requête à chaque frappe.
  const [ajbDraft, setAjbDraft] = useState(initialBundle.declaration.ajbCourseCount);
  const [ajbBusy, setAjbBusy] = useState(false);
  const [showAjbLateForm, setShowAjbLateForm] = useState(false);
  const [ajbLateForm, setAjbLateForm] = useState({ date: "", heure: "", nomCours: "", comment: "" });
  const [ajbLateConfirmationVisible, setAjbLateConfirmationVisible] = useState(false);

  const { declaration, locked } = bundle;

  useEffect(() => {
    setAjbDraft(declaration.ajbCourseCount);
  }, [declaration.id, declaration.ajbCourseCount]);

  async function refresh() {
    const res = await fetch("/api/declarations");
    if (res.ok) setBundle(await res.json());
  }

  async function handleHasChanges(value: boolean) {
    // Le bouton "Non" est désactivé tant qu'il reste des entrées saisies
    // (voir plus bas) — pas de suppression automatique en arrière-plan : le
    // prof doit d'abord les effacer une par une (bouton "Supprimer" sur
    // chaque entrée) pour éviter qu'un clic n'efface plusieurs déclarations
    // sans que ce soit clairement voulu.
    if (value === false && declaration.items.length > 0) return;
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

  function openLateForm() {
    setForm(emptyForm);
    setShowForm("late-new");
    setLateConfirmationVisible(false);
  }

  function openEditForm(item: Item) {
    setForm({
      type: item.type,
      courseId: item.courseId ?? "",
      date: item.date ? item.date.slice(0, 10) : "",
      otherTeacherId: item.otherTeacherId ?? "",
      otherTeacherFreeText: item.otherTeacherFreeText ?? "",
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
        comment: form.comment || null,
      };
      const wasLate = showForm === "late-new";
      const isNew = showForm === "new" || showForm === "late-new";
      const url = isNew ? "/api/declarations/items" : `/api/declarations/items/${showForm}`;
      const method = isNew ? "POST" : "PATCH";
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
      if (wasLate) setLateConfirmationVisible(true);
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

  async function saveAjbCourseCount() {
    setAjbBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/declarations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ajbCourseCount: ajbDraft }),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      await refresh();
    } finally {
      setAjbBusy(false);
    }
  }

  async function saveAjbLateEntry() {
    setAjbBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/declarations/ajb-late", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ajbLateForm),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      setShowAjbLateForm(false);
      setAjbLateForm({ date: "", heure: "", nomCours: "", comment: "" });
      setAjbLateConfirmationVisible(true);
      await refresh();
    } finally {
      setAjbBusy(false);
    }
  }

  async function deleteAjbLateEntry(id: string) {
    if (!confirm("Supprimer cette ligne ?")) return;
    setAjbBusy(true);
    try {
      await fetch(`/api/declarations/ajb-late/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setAjbBusy(false);
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
  // Fenêtre de saisie tardive (20-26, voir dates.ts) : la déclaration reste
  // verrouillée telle qu'envoyée, mais un changement de dernière minute
  // peut encore être ajouté à part, marqué "tardif".
  const canAddLate = locked && bundle.lateWindowOpen;
  const lateItems = declaration.items.filter((i) => i.tardif);

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

      {error && <div className="error-msg">{error}</div>}

      {locked ? (
        <div className="card">
          <span className={`badge ${STATUS_BADGE[declaration.status].cls}`}>
            {STATUS_BADGE[declaration.status].label}
          </span>
          <p className="muted" style={{ marginTop: 8 }}>
            La période est close depuis le {bundle.deadlineLabel}. Votre décompte est en lecture seule — retrouvez-le
            via « Voir l'historique » tout en bas de cette page.
          </p>
        </div>
      ) : null}

      {bundle.isAjbTeacher && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cours AJB (Area Jeune Ballet)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Les cours AJB changent trop souvent (jours, horaires, profs) pour être comptés automatiquement.
            Indiquez ici le nombre de cours AJB donnés pendant la période — sans cette information, aucun cours
            AJB ne sera pris en compte sur votre fiche de salaire.
          </p>
          {canEdit ? (
            <div className="btn-row" style={{ alignItems: "center" }}>
              <input
                type="number"
                min={0}
                step={1}
                style={{ width: 100 }}
                value={ajbDraft ?? ""}
                onChange={(e) => setAjbDraft(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                placeholder="0"
              />
              <button
                className="btn small"
                disabled={ajbBusy || ajbDraft === declaration.ajbCourseCount}
                onClick={saveAjbCourseCount}
              >
                Enregistrer
              </button>
              {declaration.ajbCourseCount === null && (
                <span className="badge warning">Pas encore rempli</span>
              )}
            </div>
          ) : (
            <p style={{ fontWeight: 600 }}>
              {declaration.ajbCourseCount !== null
                ? `${declaration.ajbCourseCount} cours AJB déclaré(s) pour cette période.`
                : "Champ non rempli — aucun cours AJB pris en compte pour cette période."}
            </p>
          )}
        </div>
      )}

      {locked && bundle.lateWindowOpen && bundle.isAjbTeacher && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Un cours AJB donné en dernière minute ?</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Signalez ici un cours AJB donné après le {bundle.deadlineLabel}, jusqu'au {bundle.lateWindowEndLabel}.
            La comptabilité sera automatiquement prévenue et décidera si ce cours est pris en compte sur le
            salaire de ce mois-ci ou du suivant.
          </p>

          {ajbLateConfirmationVisible && (
            <div className="card nested" style={{ borderLeft: "3px solid var(--accent)" }}>
              <p style={{ margin: 0 }}>
                <strong>C'est noté.</strong> Ce cours AJB a été envoyé hors délai : le service comptabilité en a
                été averti. Il sera étudié et, selon les possibilités, pris en compte sur le salaire de ce mois-ci
                — sinon, ce sera sur celui du mois suivant.
              </p>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn secondary small" onClick={() => setAjbLateConfirmationVisible(false)}>
                  Compris
                </button>
              </div>
            </div>
          )}

          {declaration.ajbLateEntries.length === 0 && !showAjbLateForm && !ajbLateConfirmationVisible && (
            <p className="muted">Aucun cours AJB tardif signalé pour l'instant.</p>
          )}
          {declaration.ajbLateEntries.map((entry) => (
            <div key={entry.id} className="card nested">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{entry.nomCours}</p>
                <span className="badge warning">Tardif</span>
              </div>
              {(entry.date || entry.heure) && (
                <p className="muted" style={{ margin: "4px 0" }}>
                  {entry.date ? entry.date.slice(0, 10) : ""} {entry.heure ?? ""}
                </p>
              )}
              {entry.comment && <p className="muted" style={{ margin: "4px 0" }}>Commentaire : {entry.comment}</p>}
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn danger small" onClick={() => deleteAjbLateEntry(entry.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {!showAjbLateForm ? (
            <button className="btn secondary" onClick={() => { setShowAjbLateForm(true); setAjbLateConfirmationVisible(false); }}>
              + Signaler un cours AJB tardif
            </button>
          ) : (
            <div className="card nested">
              <label>Nom du cours</label>
              <input
                value={ajbLateForm.nomCours}
                onChange={(e) => setAjbLateForm({ ...ajbLateForm, nomCours: e.target.value })}
                placeholder="ex. Ballet Boys (Juan)"
              />
              <div className="btn-row" style={{ marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={ajbLateForm.date}
                    onChange={(e) => setAjbLateForm({ ...ajbLateForm, date: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Heure</label>
                  <input
                    type="time"
                    value={ajbLateForm.heure}
                    onChange={(e) => setAjbLateForm({ ...ajbLateForm, heure: e.target.value })}
                  />
                </div>
              </div>
              <label>Commentaire</label>
              <textarea
                rows={3}
                value={ajbLateForm.comment}
                onChange={(e) => setAjbLateForm({ ...ajbLateForm, comment: e.target.value })}
                placeholder="Expliquez le changement (remplacement, cours ajouté, etc.)"
              />
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn secondary" onClick={() => setShowAjbLateForm(false)} disabled={ajbBusy}>
                  Annuler
                </button>
                <button className="btn" onClick={saveAjbLateEntry} disabled={ajbBusy || !ajbLateForm.nomCours.trim()}>
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {locked && bundle.lateWindowOpen && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Un changement de dernière minute ?</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Vous pouvez encore signaler un changement survenu après le {bundle.deadlineLabel}, jusqu'au{" "}
            {bundle.lateWindowEndLabel}. Votre décompte déjà envoyé n'est pas modifié — ce changement s'y ajoute à
            part et est transmis à la comptabilité.
          </p>

          {lateConfirmationVisible && (
            <div className="card nested" style={{ borderLeft: "3px solid var(--accent)" }}>
              <p style={{ margin: 0 }}>
                <strong>C'est noté.</strong> Cette entrée a été envoyée hors délai : le service comptabilité en a été
                averti. Elle sera étudiée et, selon les possibilités, prise en compte sur le salaire de ce mois-ci —
                sinon, ce sera sur celui du mois suivant.
              </p>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn secondary small" onClick={() => setLateConfirmationVisible(false)}>
                  Compris
                </button>
              </div>
            </div>
          )}

          {lateItems.length === 0 && showForm !== "late-new" && !lateConfirmationVisible && (
            <p className="muted">Aucun changement tardif signalé pour l'instant.</p>
          )}
          {lateItems.map((item) => (
            <div key={item.id} className="card nested">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{TYPE_LABELS[item.type]}</p>
                <span className="badge warning">Tardif</span>
              </div>
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
              {item.comment && <p className="muted" style={{ margin: "4px 0" }}>Commentaire : {item.comment}</p>}
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn danger small" onClick={() => deleteItem(item.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {showForm !== "late-new" && (
            <button className="btn secondary" onClick={openLateForm}>
              + Signaler un changement tardif
            </button>
          )}
        </div>
      )}

      {!locked && (
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
            <h2 style={{ margin: 0 }}>Vos entrées ce mois-ci</h2>
            <span className={`badge ${STATUS_BADGE[declaration.status].cls}`}>
              {STATUS_BADGE[declaration.status].label}
            </span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>Modifiable jusqu'au {bundle.deadlineLabel}.</p>

          {declaration.items.length === 0 && showForm !== "new" && (
            <p className="muted">Aucune entrée pour l'instant.</p>
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

          {declaration.hasChanges === true && declaration.items.length > 0 && showForm !== "new" && (
            <button className="btn secondary" onClick={openNewForm}>
              + Ajouter un changement
            </button>
          )}
        </div>
      )}

      {!locked && (
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: "1.05rem", marginTop: 0 }}>Avez-vous eu des changements ce mois-ci ?</p>
          <div className="segmented">
            <button
              type="button"
              className={`seg ${declaration.hasChanges === false ? "selected" : ""}`}
              disabled={busy || declaration.items.length > 0}
              title={
                declaration.items.length > 0
                  ? "Supprimez d'abord vos entrées ci-dessus pour pouvoir choisir « Non »"
                  : undefined
              }
              onClick={() => handleHasChanges(false)}
            >
              Non, rien n'a changé
            </button>
            <button
              type="button"
              className={`seg ${declaration.hasChanges === true ? "selected" : ""}`}
              disabled={busy}
              onClick={() => handleHasChanges(true)}
            >
              Oui, il y a eu des changements
            </button>
          </div>
          {declaration.items.length > 0 && (
            <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: "0.85rem" }}>
              Pour revenir sur « rien n'a changé », supprimez d'abord toutes vos entrées ci-dessus (bouton «
              Supprimer » sur chaque entrée).
            </p>
          )}
        </div>
      )}

      {(canEdit || canAddLate) && showForm && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            {showForm === "late-new"
              ? "Nouveau changement tardif"
              : showForm === "new"
                ? "Nouveau changement"
                : "Modifier le changement"}
          </h2>

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
              const dateAuto = dateAutoPourCours(course, bundle.period);
              setForm({
                ...form,
                courseId,
                // Pré-remplie automatiquement selon le jour de la semaine du
                // cours choisi, le plus proche dans la période ; reste
                // modifiable si besoin.
                date: dateAuto ?? form.date,
              });
            }}
          >
            <option value="">— Sélectionner —</option>
            <optgroup label="Vos cours">
              {bundle.myCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code}) — {c.jour ? `${c.jour}${c.heureDebut ? ` ${c.heureDebut}–${c.heureFin ?? ""}` : ""}` : "sans jour fixe"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Autres cours de l'école">
              {bundle.otherCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomCours} ({c.code}) — {c.jour ? `${c.jour}${c.heureDebut ? ` ${c.heureDebut}–${c.heureFin ?? ""}` : ""}` : "sans jour fixe"} —{" "}
                  {c.teacher ? c.teacher.name : "sans titulaire"}
                </option>
              ))}
            </optgroup>
          </select>

          <label>
            Date{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              (pré-remplie selon le jour habituel du cours choisi, modifiable)
            </span>
          </label>
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
        <a href="/prof/historique" className="btn secondary">
          Voir l'historique
        </a>
      </p>
    </main>
  );
}
