import { PrismaClient } from "@prisma/client";

// Évite de recréer une nouvelle connexion Prisma à chaque rechargement en
// développement (Next.js recharge les modules à chaud).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
