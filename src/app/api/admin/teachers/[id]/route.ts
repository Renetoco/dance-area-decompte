import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, canManageCourses, generateTempPassword, hashPassword } from "@/lib/auth";
import { logAdminAction } from "@/lib/auditLog";
import { sendWelcomeEmail } from "@/lib/email";
import { AdminRole, TeacherRole } from "@prisma/client";

const TEACHER_ROLE_LABELS: Record<TeacherRole, string> = {
  ENSEIGNANT: "enseignant·e",
  MUSICIEN: "musicien·ne",
};

// Fiche détaillée d'un prof : ses cours (titulaire + participations
// musicien/co-prof) et son historique de déclarations, toutes périodes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { id: params.id },
    include: {
      courses: {
        where: { active: true },
        orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
      },
      courseParticipations: {
        include: { course: true },
      },
      declarations: {
        orderBy: { period: "desc" },
        select: {
          id: true,
          period: true,
          status: true,
          hasChanges: true,
          submittedAt: true,
          items: { select: { id: true } },
        },
      },
    },
  });
  if (!teacher) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  return NextResponse.json({ teacher });
}

// Met à jour l'email (ce qui active le compte s'il n'existait pas encore
// et envoie les identifiants), le rôle (enseignant/musicien) et/ou le
// statut actif/inactif d'un prof. Réservé à qui peut gérer les cours
// (demande de Rene du 18.09.2026, voir canManageCourses ; auparavant
// réservé au seul compte ADMIN).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à modifier ce prof." }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({ where: { id: params.id } });
  if (!teacher) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const { email, active, role, ajbTeacher, tempPassword: customTempPassword } = await req.json();
  const data: {
    email?: string;
    active?: boolean;
    passwordHash?: string;
    mustResetPwd?: boolean;
    role?: TeacherRole;
    ajbTeacher?: boolean;
  } = {};

  if (typeof active === "boolean") data.active = active;
  if (role && role in TeacherRole) data.role = role as TeacherRole;
  // Donne des cours AJB (Area Jeune Ballet) — coché à la main (demande de
  // Rene du 18.09.2026), fait apparaître le champ "cours AJB" et l'option
  // d'entrée tardive AJB dans le décompte de ce prof.
  if (typeof ajbTeacher === "boolean") data.ajbTeacher = ajbTeacher;

  let tempPassword: string | undefined;
  if (email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    data.email = normalizedEmail;
    if (!teacher.passwordHash) {
      // Première activation du compte : on génère un mot de passe temporaire
      // (ou on utilise celui fourni, ex. pour communiquer des identifiants
      // de démo directement).
      tempPassword =
        typeof customTempPassword === "string" && customTempPassword.trim().length >= 6
          ? customTempPassword.trim()
          : generateTempPassword();
      data.passwordHash = await hashPassword(tempPassword);
      data.mustResetPwd = true;
    }
  }

  const updated = await prisma.teacher.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      analyticCode: true,
      name: true,
      email: true,
      active: true,
      mustResetPwd: true,
      role: true,
      ajbTeacher: true,
    },
  });

  if (typeof active === "boolean" && active !== teacher.active) {
    await logAdminAction(admin, {
      action: active ? "teacher.reactivated" : "teacher.deactivated",
      entityType: "Teacher",
      entityId: teacher.id,
      description: `Prof ${active ? "réactivé·e" : "désactivé·e"} : ${updated.name}`,
    });
  }
  if (role && role in TeacherRole && role !== teacher.role) {
    await logAdminAction(admin, {
      action: "teacher.role_changed",
      entityType: "Teacher",
      entityId: teacher.id,
      description: `Rôle de ${updated.name} changé : ${TEACHER_ROLE_LABELS[teacher.role]} → ${TEACHER_ROLE_LABELS[role as TeacherRole]}`,
    });
  }
  if (typeof ajbTeacher === "boolean" && ajbTeacher !== teacher.ajbTeacher) {
    await logAdminAction(admin, {
      action: ajbTeacher ? "teacher.marked_ajb" : "teacher.unmarked_ajb",
      entityType: "Teacher",
      entityId: teacher.id,
      description: `${updated.name} ${ajbTeacher ? "marqué·e" : "démarqué·e"} comme donnant des cours AJB`,
    });
  }
  if (email && updated.email !== teacher.email) {
    await logAdminAction(admin, {
      action: teacher.email ? "teacher.email_changed" : "teacher.activated",
      entityType: "Teacher",
      entityId: teacher.id,
      description: teacher.email
        ? `Email de ${updated.name} changé : ${teacher.email} → ${updated.email}`
        : `Compte activé pour ${updated.name} (${updated.email})`,
    });
  }

  let emailSent: boolean | undefined;
  if (tempPassword && updated.email) {
    emailSent = true;
    try {
      await sendWelcomeEmail({ to: updated.email, teacherName: updated.name, tempPassword });
    } catch (e) {
      emailSent = false;
      console.error("Échec d'envoi de l'email de bienvenue :", e);
    }
  }

  // Le mot de passe temporaire n'est renvoyé qu'à la première activation
  // (quand on vient d'en générer un), pour pouvoir le communiquer
  // directement même si l'email de bienvenue échoue.
  return NextResponse.json({ teacher: updated, tempPassword, emailSent });
}

// Supprime définitivement un prof — réservé aux profs qui n'ont encore
// aucune trace dans le système (créés par erreur, doublon, etc.). Dès qu'il
// y a le moindre historique (cours, déclaration, intervention comme
// musicien·ne, citation dans la déclaration d'un·e collègue), la suppression
// est refusée pour ne jamais perdre de données : on désactive à la place.
// Réservé à qui peut gérer les cours (demande de Rene du 18.09.2026, voir
// canManageCourses ; auparavant réservé au seul compte ADMIN).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION]);
  if (!admin || !canManageCourses(admin)) {
    return NextResponse.json({ error: "Non autorisé à supprimer un prof." }, { status: 403 });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          courses: true,
          declarations: true,
          courseParticipations: true,
          reminderLogs: true,
          citedInItems: true,
        },
      },
    },
  });
  if (!teacher) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const { courses, declarations, courseParticipations, reminderLogs, citedInItems } = teacher._count;
  if (courses + declarations + courseParticipations + reminderLogs + citedInItems > 0) {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer : ce prof a des cours ou un historique de déclarations rattachés. Désactivez-le plutôt.",
      },
      { status: 409 }
    );
  }

  await prisma.teacher.delete({ where: { id: params.id } });

  await logAdminAction(admin, {
    action: "teacher.deleted",
    entityType: "Teacher",
    entityId: teacher.id,
    description: `Prof supprimé·e : ${teacher.name}`,
  });

  return NextResponse.json({ ok: true });
}
