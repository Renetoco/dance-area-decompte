import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminRole } from "@prisma/client";
import { formatPeriodLabel } from "@/lib/dates";
import CourseParticipants from "@/components/CourseParticipants";
import CourseEditForm from "@/components/CourseEditForm";
import CourseTeacherEditor from "@/components/CourseTeacherEditor";

const TYPE_LABELS: Record<string, string> = {
  REMPLACEMENT_EFFECTUE: "Remplacement effectué",
  ABSENCE_REMPLACEE: "Absence remplacée",
  ABSENCE_NON_REMPLACEE: "Absence non remplacée",
  AUTRE: "Autre",
};

export default async function FicheCoursPage({ params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) redirect("/connexion");

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      teacher: { select: { id: true, name: true, email: true, role: true } },
      participants: {
        include: { teacher: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      declarationItems: {
        include: {
          otherTeacher: { select: { id: true, name: true } },
          declaration: { select: { period: true, teacher: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!course) notFound();

  const history = course.declarationItems
    .slice()
    .sort((a, b) => (a.declaration.period === b.declaration.period ? 0 : a.declaration.period < b.declaration.period ? 1 : -1));

  const allTeachers = await prisma.teacher.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Titulaire et musicien·nes/co-enseignant·es rattaché·es : réservé à qui
  // peut gérer les cours (demande de Rene du 18.09.2026, voir
  // canManageCourses ; auparavant réservé au seul compte ADMIN).
  const canEdit = canManageCourses(admin);
  // Nom, jour et horaire du cours : ouvert à l'admin, la comptabilité et la
  // direction (demande de Rene du 17.09.2026) — distinct de `canEdit`
  // ci-dessus.
  const canEditCourseFields =
    admin.role === "ADMIN" || admin.role === "COMPTABILITE" || admin.role === "DIRECTION";

  return (
    <div>
      <Link href="/admin/cours" className="back-link">
        ← Retour à la liste des cours
      </Link>

      <div className="fiche-header">
        <div>
          <h1>{course.nomCours}</h1>
          <div className="fiche-meta">
            <span className="muted">{course.categorie}</span>
            <span className="muted">Code {course.code}</span>
            {course.jour && (
              <span className="muted">
                {course.jour} {course.heureDebut ? `${course.heureDebut} – ${course.heureFin ?? ""}` : ""}
              </span>
            )}
            {course.isAJB && <span className="badge info">AJB</span>}
            {!course.active && <span className="badge neutral">Désactivé</span>}
          </div>
          <CourseEditForm
            courseId={course.id}
            initialNomCours={course.nomCours}
            initialJour={course.jour}
            initialHeureDebut={course.heureDebut}
            initialHeureFin={course.heureFin}
            initialIsAJB={course.isAJB}
            canEdit={canEditCourseFields}
          />
        </div>
      </div>

      <h2>Titulaire</h2>
      <CourseTeacherEditor
        courseId={course.id}
        courseNomCours={course.nomCours}
        initialTeacher={course.teacher ? { id: course.teacher.id, name: course.teacher.name } : null}
        teachers={allTeachers}
        canEdit={canEdit}
      />

      <h2>Musicien·nes et co-enseignant·es rattaché·es</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Pour les cours où quelqu'un accompagne (ex. un·e musicien·ne au piano pour un cours de danse classique) ou
        co-enseigne régulièrement, sans en être titulaire.
      </p>
      <CourseParticipants
        courseId={course.id}
        initialParticipants={course.participants}
        teachers={allTeachers}
        canEdit={canEdit}
      />

      <h2>Historique des changements déclarés sur ce cours ({history.length})</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Toutes périodes confondues — permet de voir si plusieurs profs sont intervenu·es sur ce cours, à la même
        date ou à des dates différentes.
      </p>
      {history.length === 0 ? (
        <p className="muted">Aucun changement déclaré sur ce cours pour l'instant.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Période</th>
                <th>Date</th>
                <th>Déclaré par</th>
                <th>Type</th>
                <th>Avec</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{formatPeriodLabel(item.declaration.period)}</td>
                  <td>{item.date ? new Date(item.date).toLocaleDateString("fr-CH") : "—"}</td>
                  <td>
                    <Link href={`/admin/profs/${item.declaration.teacher.id}`}>{item.declaration.teacher.name}</Link>
                  </td>
                  <td>{TYPE_LABELS[item.type] ?? item.type}</td>
                  <td>
                    {item.otherTeacher ? (
                      <Link href={`/admin/profs/${item.otherTeacher.id}`}>{item.otherTeacher.name}</Link>
                    ) : (
                      item.otherTeacherFreeText ?? "—"
                    )}
                  </td>
                  <td>{item.comment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
