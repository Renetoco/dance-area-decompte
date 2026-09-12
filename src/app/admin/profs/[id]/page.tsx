import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminRole } from "@prisma/client";
import { formatPeriodLabel } from "@/lib/dates";

const ROLE_LABELS: Record<string, string> = {
  ENSEIGNANT: "Enseignant·e",
  MUSICIEN: "Musicien·ne",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Non soumis", cls: "warning" },
  SUBMITTED_MANUAL: { label: "Soumis", cls: "success" },
  SUBMITTED_AUTO: { label: "Auto-soumis", cls: "neutral" },
};

const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  MUSICIEN: "Musicien·ne",
  CO_ENSEIGNANT: "Co-enseignant·e",
};

export default async function FicheProfPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) redirect("/connexion");

  const teacher = await prisma.teacher.findUnique({
    where: { id: params.id },
    include: {
      courses: { where: { active: true }, orderBy: [{ jour: "asc" }, { heureDebut: "asc" }] },
      courseParticipations: {
        include: { course: true },
        orderBy: { createdAt: "asc" },
      },
      declarations: {
        orderBy: { period: "desc" },
        include: { _count: { select: { items: true } } },
      },
    },
  });
  if (!teacher) notFound();

  return (
    <div>
      <Link href="/admin" className="back-link">
        ← Retour au tableau de bord
      </Link>

      <div className="fiche-header">
        <div>
          <h1>{teacher.name}</h1>
          <div className="fiche-meta">
            <span className="muted">Code {teacher.analyticCode}</span>
            <span className={`badge ${teacher.role === "MUSICIEN" ? "info" : "neutral"}`}>
              {ROLE_LABELS[teacher.role]}
            </span>
            <span className={`badge ${teacher.active ? "success" : "neutral"}`}>
              {teacher.active ? "Actif" : "Désactivé"}
            </span>
          </div>
          {teacher.email && <p className="muted" style={{ marginTop: 6 }}>{teacher.email}</p>}
        </div>
      </div>

      <h2>Cours dont {teacher.role === "MUSICIEN" ? "il/elle est référent·e" : "il/elle est titulaire"} ({teacher.courses.length})</h2>
      {teacher.courses.length === 0 ? (
        <p className="muted">Aucun cours rattaché.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Cours</th>
                <th>Catégorie</th>
                <th>Jour</th>
                <th>Horaire</th>
              </tr>
            </thead>
            <tbody>
              {teacher.courses.map((c) => (
                <tr key={c.id} className="is-clickable">
                  <td className="muted">{c.code}</td>
                  <td>
                    <Link href={`/admin/cours/${c.id}`}>{c.nomCours}</Link>
                  </td>
                  <td>{c.categorie}</td>
                  <td>{c.jour ?? "—"}</td>
                  <td>{c.heureDebut ? `${c.heureDebut} – ${c.heureFin ?? ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {teacher.courseParticipations.length > 0 && (
        <>
          <h2>Interventions comme musicien·ne / co-enseignant·e ({teacher.courseParticipations.length})</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Cours</th>
                  <th>Rôle</th>
                  <th>Jour</th>
                  <th>Horaire</th>
                </tr>
              </thead>
              <tbody>
                {teacher.courseParticipations.map((p) => (
                  <tr key={p.id}>
                    <td className="muted">{p.course.code}</td>
                    <td>
                      <Link href={`/admin/cours/${p.course.id}`}>{p.course.nomCours}</Link>
                    </td>
                    <td>
                      <span className="badge info">{PARTICIPANT_ROLE_LABELS[p.role]}</span>
                    </td>
                    <td>{p.course.jour ?? "—"}</td>
                    <td>{p.course.heureDebut ? `${p.course.heureDebut} – ${p.course.heureFin ?? ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Historique des déclarations ({teacher.declarations.length})</h2>
      {teacher.declarations.length === 0 ? (
        <p className="muted">Aucune déclaration pour l'instant.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Période</th>
                <th>Statut</th>
                <th>Changements</th>
                <th>Soumis le</th>
                <th>Lignes</th>
              </tr>
            </thead>
            <tbody>
              {teacher.declarations.map((d) => (
                <tr key={d.id}>
                  <td>{formatPeriodLabel(d.period)}</td>
                  <td>
                    <span className={`badge ${STATUS_LABELS[d.status].cls}`}>{STATUS_LABELS[d.status].label}</span>
                  </td>
                  <td>{d.hasChanges == null ? "—" : d.hasChanges ? "Oui" : "Non"}</td>
                  <td>{d.submittedAt ? new Date(d.submittedAt).toLocaleString("fr-CH") : "—"}</td>
                  <td>{d._count.items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
