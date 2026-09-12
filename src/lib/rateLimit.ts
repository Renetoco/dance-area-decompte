import { prisma } from "./db";
import { NextRequest } from "next/server";

type RateLimitOptions = {
  /** Nombre de tentatives autorisées dans la fenêtre avant blocage. */
  maxAttempts: number;
  /** Durée de la fenêtre glissante (ms) après laquelle le compteur repart à zéro. */
  windowMs: number;
  /** Durée du blocage (ms) une fois maxAttempts dépassé. */
  lockMs: number;
};

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Limiteur de tentatives basé sur Postgres (pas de dépendance externe type
 * Redis) — voir SECURITY-REVIEW.md #2 (brute force login) et #5 (spam de
 * réinitialisation de mot de passe). Fonctionne correctement entre plusieurs
 * instances serverless puisque l'état vit en base, contrairement à un
 * compteur en mémoire.
 *
 * Appeler `checkRateLimit` AVANT de traiter la requête. Appeler
 * `resetRateLimit` après un succès (ex. bon mot de passe) pour ne pas pénaliser
 * l'utilisateur légitime après quelques essais ratés.
 */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();

  const row = await prisma.rateLimit.findUnique({ where: { key } });

  if (row?.lockedUntil && row.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000) };
  }

  const windowExpired = !row || now.getTime() - row.windowStart.getTime() > opts.windowMs;
  const nextAttempts = windowExpired ? 1 : row.attempts + 1;

  if (nextAttempts > opts.maxAttempts) {
    const lockedUntil = new Date(now.getTime() + opts.lockMs);
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, attempts: nextAttempts, windowStart: now, lockedUntil },
      update: { attempts: nextAttempts, lockedUntil, windowStart: windowExpired ? now : undefined },
    });
    return { allowed: false, retryAfterSeconds: Math.ceil(opts.lockMs / 1000) };
  }

  await prisma.rateLimit.upsert({
    where: { key },
    create: { key, attempts: nextAttempts, windowStart: now, lockedUntil: null },
    update: {
      attempts: nextAttempts,
      windowStart: windowExpired ? now : undefined,
      lockedUntil: null,
    },
  });

  return { allowed: true };
}

/** À appeler après une action réussie (ex. login OK) pour ne pas pénaliser
 * l'utilisateur légitime lors de sa prochaine tentative. */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** Adresse IP du client, en tenant compte du proxy Vercel. Ne PAS faire
 * confiance à cet en-tête pour de l'autorisation — seulement pour du
 * rate-limiting best-effort. */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
