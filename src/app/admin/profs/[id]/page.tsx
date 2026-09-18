import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, canManageCourses } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminRole } from "@prisma/client";
import TeacherDeclarationsHistory from "@/components/TeacherDeclarationsHistory";
import TeacherCourseManager from "@/components/TeacherCourseManager";
import TeacherParticipationManager from "@/components/TeacherParticipationManager";

const ROLE_LABELS: Record<string, string> = {
  ENSEIGNANT: "Enseignant·e",
  MUSICIEN: "Musicien·ne",
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

  const canEdit = canManageCourses(admin);
  const allActiveCourses = canEdit
    ? await prisma.course.findMany({
        where: { active: true },
        select: { id: true, code: true, nomCours: true, teacher: { select: { id: true, name: true } } },
        orderBy: { nomCours: "asc" },
      })
    : [];

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
      <TeacherCourseManager
        teacherId={teacher.id}
        initialCourses={teacher.courses.map((c) => ({
          id: c.id,
          code: c.code,
          nomCours: c.nomCours,
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
        }))}
        availableCourses={allActiveCourses}
        canEdit={canEdit}
      />

      <h2>Interventions comme musicien·ne / co-enseignant·e ({teacher.courseParticipations.length})</h2>
      <TeacherParticipationManager
        teacherId={teacher.id}
        initialParticipations={teacher.courseParticipations.map((p) => ({
          id: p.id,
          role: p.role,
          course: {
            id: p.course.id,
            code: p.course.code,
            nomCours: p.course.nomCours,
            jour: p.course.jour,
            heureDebut: p.course.heureDebut,
            heureFin: p.course.heureFin,
          },
        }))}
        availableCourses={allActiveCourses.map((c) => ({ id: c.id, code: c.code, nomCours: c.nomCours }))}
        canEdit={canEdit}
      />

      <h2>Historique des déclarations ({teacher.declarations.length})</h2>
      <TeacherDeclarationsHistory declarations={teacher.declarations} />
    </div>
  );
}
