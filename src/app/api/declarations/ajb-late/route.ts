import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { currentPeriod, isWithinLateWindow } from "@/lib/dates";
import { getOrCreateDeclaration } from "@/lib/declarationBundle";
import { sendAjbLateEntryAlert } from "@/lib/email";
import { AdminRole } from "@prisma/client";

/**
 * Changement AJB de dernière minute (entre le 20 et la fin de la période,
 * voir isWithinLateWindow) — réservé aux profs marqué·es Teacher.ajbTeacher
 * (demande de Rene du 18.09.2026). Contrairement aux autres entrées
 * tardives (voir /api/declarations/items), le cours est décrit en texte
 * libre plutôt que choisi dans une liste, puisque les remplacements AJB ne
 * correspondent pas toujours à un cours existant du planning.
 */
export async function POST(req: NextRequest) {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  if (!teacher.ajbTeacher) {
    return NextResponse.json({ error: "Cette option est réservée aux profs donnant des cours AJB." }, { status: 403 });
  }

  const period = currentPeriod();
  if (!isWithinLateWindow(period)) {
    return NextResponse.json(
      { error: "Cette option n'est disponible qu'entre la date limite et la fin de la période." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { date, heure, nomCours, comment } = body;
  if (!nomCours || typeof nomCours !== "string" || !nomCours.trim()) {
    return NextResponse.json({ error: "Le nom du cours est requis." }, { status: 400 });
  }

  const declaration = await getOrCreateDeclaration(teacher.id, period);

  const entry = await prisma.ajbLateEntry.create({
    data: {
      declarationId: declaration.id,
      date: date ? new Date(date) : null,
      heure: heure || null,
      nomCours: nomCours.trim(),
      comment: comment || null,
    },
  });

  try {
    const recipients = await prisma.adminUser.findMany({
      where: { active: true, role: { in: [AdminRole.COMPTABILITE, AdminRole.DIRECTION] } },
      select: { email: true },
    });
    const to = recipients.map((r) => r.email).filter(Boolean);
    await sendAjbLateEntryAlert({
      to,
      teacherName: teacher.name,
      period,
      entry: {
        date: entry.date ? entry.date.toISOString().slice(0, 10) : null,
        heure: entry.heure,
        nomCours: entry.nomCours,
        comment: entry.comment,
      },
    });
  } catch (e) {
    console.error("Échec d'envoi de l'alerte cours AJB tardif :", e);
  }

  return NextResponse.json({ entry });
}
