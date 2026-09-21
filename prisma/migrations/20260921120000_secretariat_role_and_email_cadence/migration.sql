-- Ajoute le rôle SECRETARIAT (mêmes droits que COMPTABILITE, moins d'emails
-- automatiques — voir AdminRole dans schema.prisma et cronJobs.ts).
ALTER TYPE "AdminRole" ADD VALUE 'SECRETARIAT';
