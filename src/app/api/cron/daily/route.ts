import { NextRequest, NextResponse } from "next/server";
import { runDailyCronTick } from "@/lib/cronJobs";

/**
 * À appeler au moins une fois par heure (Vercel Cron ou un pingeur externe
 * — voir DEPLOIEMENT.md). Protégé par CRON_SECRET : la requête doit
 * porter l'en-tête "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const results = await runDailyCronTick();
  return NextResponse.json({ ok: true, results });
}
