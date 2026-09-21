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
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
  if (!admin) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

  const teacher = await prisma.teacher.findUnique({
    where: { id: params.id },
    include: {
      // Pas de filtre sur active : la fiche doit montrer tous les cours
      // rattachés, y compris désactivés (demande de Rene du 21.09.2026).
      courses: {
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
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
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
// aucune trace "de fond" dans le système (créés par erreur, doublon, etc.).
// Dès qu'il y a le moindre historique métier (cours, déclaration,
// intervention comme musicien·ne, citation dans la déclaration d'un·e
// collègue), la suppression est refusée pour ne jamais perdre de données :
// on désactive à la place. Les emails de rappel (ReminderLog) ne bloquent
// PLUS la suppression : ce n'est qu'une trace technique d'envoi, sans valeur
// une fois le prof supprimé — ils sont simplement effacés avec lui/elle
// (ajustement du 21.09.2026, suite à un cas bloqué uniquement par 1 email de
// rappel alors que le prof n'avait plus aucun cours ni déclaration).
// Réservé à qui peut gérer les cours (demande de Rene du 18.09.2026, voir
// canManageCourses ; auparavant réservé au seul compte ADMIN).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin([AdminRole.ADMIN, AdminRole.COMPTABILITE, AdminRole.DIRECTION, AdminRole.SECRETARIAT]);
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
  if (courses + declarations + courseParticipations + citedInItems > 0) {
    // Détaille ce qui bloque plutôt qu'un message générique — un prof peut
    // avoir 0 cours en tant que titulaire (colonne "Cours" du tableau) tout
    // en étant rattaché comme musicien·ne/co-enseignant·e à un ou plusieurs
    // cours (invisible dans cette colonne), ce qui suffit à bloquer la
    // suppression (demande de Rene du 21.09.2026, confusion constatée).
    const raisons: string[] = [];
    if (courses > 0) raisons.push(`${courses} cours en tant que titulaire`);
    if (courseParticipations > 0) raisons.push(`${courseParticipations} intervention(s) comme musicien·ne/co-enseignant·e`);
    if (declarations > 0) raisons.push(`${declarations} déclaration(s)`);
    if (citedInItems > 0) raisons.push(`cité·e dans ${citedInItems} déclaration(s) d'un·e collègue`);

    return NextResponse.json(
      {
        error: `Impossible de supprimer : ${raisons.join(", ")}. Désactivez-le/la plutôt.`,
      },
      { status: 409 }
    );
  }

  // Les éventuels emails de rappel ne bloquent plus la suppression : on les
  // efface avec le prof, dans la même transaction, pour ne pas laisser de
  // lignes orphelines (contrainte de clé étrangère sur ReminderLog.teacherId).
  await prisma.$transaction([
    prisma.reminderLog.deleteMany({ where: { teacherId: params.id } }),
    prisma.teacher.delete({ where: { id: params.id } }),
  ]);

  await logAdminAction(admin, {
    action: "teacher.deleted",
    entityType: "Teacher",
    entityId: teacher.id,
    description: `Prof supprimé·e : ${teacher.name}${
      reminderLogs > 0 ? ` (dont ${reminderLogs} email(s) de rappel associé(s), également supprimé(s))` : ""
    }`,
  });

  return NextResponse.json({ ok: true });
}
