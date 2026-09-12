import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPeriodLabel } from "@/lib/dates";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Non soumis",
  SUBMITTED_MANUAL: "Soumis",
  SUBMITTED_AUTO: "Soumis automatiquement",
};

const TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué",
  ABSENCE_REMPLACEE: "Absence remplacée",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre",
};

export default async function HistoriquePage() {
  const teacher = await requireTeacher();
  if (!teacher) redirect("/connexion");

  const declarations = await prisma.monthlyDeclaration.findMany({
    where: { teacherId: teacher.id },
    include: { items: { include: { course: true, otherTeacher: { select: { id: true, name: true } } } } },
    orderBy: { period: "desc" },
  });

  return (
    <main className="page">
      <div className="top-bar">
        <h1>Historique</h1>
        <a href="/prof" className="btn secondary small">
          Retour
        </a>
      </div>

      {declarations.length === 0 && <p className="muted">Aucun décompte pour l'instant.</p>}

      {declarations.map((d) => (
        <div className="card" key={d.id}>
          <p style={{ fontWeight: 600, margin: 0 }}>{formatPeriodLabel(d.period)}</p>
          <p className="muted" style={{ margin: "4px 0" }}>
            {STATUS_LABELS[d.status]} {d.hasChanges === false && "— aucun changement"}
          </p>
          {d.items.map((item) => (
            <p key={item.id} className="muted" style={{ margin: "2px 0", fontSize: "0.85rem" }}>
              • {TYPE_LABELS[item.type]}
              {item.course ? ` — ${item.course.nomCours}` : ""}
              {item.date ? ` — ${item.date.toISOString().slice(0, 10)}` : ""}
              {item.otherTeacher ? ` — avec ${item.otherTeacher.name}` : item.otherTeacherFreeText ? ` — avec ${item.otherTeacherFreeText}` : ""}
            </p>
          ))}
        </div>
      ))}
    </main>
  );
}
