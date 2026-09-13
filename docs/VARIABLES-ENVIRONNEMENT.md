# Variables d'environnement

Toutes ces variables se configurent dans **Vercel → Projet →
Settings → Environment Variables** (pour la production), et
optionnellement dans un fichier `.env` local (copie de `.env.example`)
pour travailler en local. **Aucune valeur réelle ne doit jamais être
commitée dans le dépôt** — seul `.env.example` (avec des valeurs
factices) est versionné.

| Variable | Rôle | Où l'obtenir / la générer |
|---|---|---|
| `DATABASE_URL` | Chaîne de connexion à la base PostgreSQL | Console Neon → le projet → "Connection string" |
| `SESSION_SECRET` | Signe/chiffre les cookies de session. **Obligatoire, 32 caractères minimum** — l'app refuse de démarrer sans. | Générer avec `openssl rand -base64 48`. Une valeur différente en local et en production. |
| `CRON_SECRET` | Secret partagé avec cron-job.org pour autoriser l'appel à `/api/cron/daily` | Générer une chaîne aléatoire (ex. `openssl rand -hex 32`) ; la reporter aussi dans l'en-tête `Authorization: Bearer <valeur>` configuré côté cron-job.org |
| `APP_URL` | URL publique de l'app (utilisée dans les liens des emails et le QR code) | L'URL de production Vercel, ex. `https://dance-area-decompte.vercel.app` |
| `SMTP_HOST` | Serveur SMTP | `mail.infomaniak.com` |
| `SMTP_PORT` | Port SMTP | `587` |
| `SMTP_USER` | Adresse d'envoi des emails | `rene.torres@dancearea.ch` |
| `SMTP_PASSWORD` | Mot de passe de cette boîte mail (ou mot de passe d'application) | Panneau Infomaniak de la boîte mail |
| `MAIL_FROM` | Nom + adresse affichés comme expéditeur | ex. `Dance Area — Décomptes <rene.torres@dancearea.ch>` |
| `ADMIN_EMAIL` | Email du 1er compte admin, utilisé **uniquement** par le script de seed (`npm run seed`) s'il n'existe encore aucun admin | — |
| `ADMIN_INITIAL_PASSWORD` | Mot de passe initial de ce même compte, à changer immédiatement après la 1ère connexion | — |

## Points d'attention

- **Un changement de `SESSION_SECRET` déconnecte tout le monde** (tous les
  cookies de session existants deviennent invalides). C'est normal et
  volontaire si on doit un jour le faire — informer l'équipe avant.
- **Vercel ne relit les variables d'environnement qu'à un nouveau
  déploiement.** Après avoir ajouté/modifié une variable dans l'interface
  Vercel, il faut redéployer (push, ou bouton "Redeploy") pour qu'elle
  soit prise en compte — c'est ce qui a causé la panne du cron le
  12–13 septembre 2026 (voir `HANDOFF.md`).
- `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` ne servent qu'une fois, à
  l'initialisation d'une base vide. Elles peuvent rester en place sans
  risque particulier tant que le mot de passe a bien été changé après la
  première connexion (c'est forcé par l'app via `mustResetPwd`).
- Ne jamais mettre une valeur réelle de ces variables dans un message,
  un fichier du dépôt, ou une capture d'écran partagée publiquement.
