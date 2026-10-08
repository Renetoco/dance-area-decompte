# Runbook — opérations courantes

Guide pas à pas pour les tâches de maintenance les plus fréquentes. Écrit
pour quelqu'un qui n'a pas suivi le développement au jour le jour.

## Déployer une modification du code

1. Le code modifié doit être commité et poussé sur la branche `main` du
   dépôt GitHub `Renetoco/dance-area-decompte`.
2. Vercel détecte automatiquement le push et lance un nouveau
   déploiement — rien d'autre à faire. On peut suivre l'avancement dans
   Vercel → le projet → onglet "Deployments".
3. Si le build échoue, l'ancien déploiement reste en ligne (pas de coupure
   de service) — regarder les logs de build dans Vercel pour identifier
   l'erreur.
4. Si une variable d'environnement a été ajoutée/modifiée en même temps,
   voir la remarque dans `VARIABLES-ENVIRONNEMENT.md` (il faut un nouveau
   déploiement pour qu'elle soit prise en compte).

**⚠️ Un seul flux de travail à la fois.** Si plusieurs personnes (ou
plusieurs sessions/outils Claude) modifient le code en parallèle sans se
coordonner, deux versions différentes du même fichier peuvent s'écraser
l'une l'autre au moment du push — c'est déjà arrivé une fois (voir
`HANDOFF.md`). Avant de commencer une nouvelle série de modifications,
vérifier qu'on part bien de la dernière version : `git fetch origin` puis
`git log origin/main` pour comparer avec ce qu'on a en local.

### Déploiement avec migration de base de données

Certaines livraisons ajoutent un fichier dans `prisma/migrations/` (une
modification de la structure de la base — nouvelle colonne, nouvelle
valeur de rôle, etc.). Cette migration doit être appliquée à la base
Neon de production, sinon le nouveau code peut planter en cherchant une
colonne/valeur qui n'existe pas encore en base.

**Configuration recommandée (à faire une seule fois) : appliquer les
migrations automatiquement à chaque déploiement Vercel**, pour ne plus
jamais avoir à s'en souvenir manuellement :

1. Vercel → le projet `dance-area-decompte` → **Settings** → **Build and
   Deployment**.
2. Section **Build Command** : décocher "Inherited from Framework
   Preset" (ou cliquer sur "Override"), puis saisir :
   ```
   npx prisma migrate deploy && npm run build
   ```
3. Enregistrer.

À partir de là, chaque déploiement Vercel applique d'abord les
migrations en attente sur la base de production (avec la variable
`DATABASE_URL` déjà configurée dans Vercel), puis construit
l'application — sans commande à taper depuis un ordinateur personnel.
Si une migration a déjà été appliquée précédemment, `prisma migrate
deploy` ne fait rien (pas d'erreur, pas de doublon) : cette commande
peut rester en place en permanence, y compris les mois sans migration.

Si le build échoue juste après ce changement, regarder les logs Vercel :
un message mentionnant `prisma migrate deploy` indique un souci de
migration (à distinguer d'une erreur de compilation classique).

## Réactiver un compte désactivé (prof ou admin)

1. Se connecter en tant qu'`ADMIN`.
2. Prof : `Administration` → `Comptes des profs` → trouver la ligne →
   bouton "Réactiver".
   Admin/comptabilité/direction : `Administration` → `Comptes
   comptabilité / direction / administrateur` → même principe.
3. Les deux comptes protégés (`rene.torres@dancearea.ch` et
   `anastasia@dancearea.ch`) n'ont pas besoin de ce bouton : ils ne
   peuvent jamais être désactivés.

## Réinitialiser un mot de passe

- **Depuis l'app (sans accès admin)** : sur l'écran de connexion, "mot de
  passe oublié" envoie un nouveau mot de passe temporaire par email à
  l'adresse du compte (limité à 3 demandes par heure et par compte, pour
  éviter les abus).
- **Depuis l'administration** : `Administration` → trouver le compte →
  bouton de réinitialisation — un nouveau mot de passe temporaire est
  généré et envoyé par email ; la personne devra en choisir un nouveau à
  sa prochaine connexion.
- **Si plus personne n'a accès à aucun compte admin** (cas extrême) :
  passer par la console SQL de Neon (voir plus bas "Accéder directement à
  la base de données") pour relire/modifier directement la table
  `AdminUser`, ou relancer le script `npm run seed` avec les variables
  `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` définies, qui ne crée un compte
  que si aucun n'existe encore.

## Ajouter / supprimer un admin, un prof, ou un cours

Tout se fait depuis `/admin/administration` (réservé au rôle `ADMIN`) :

- **Comptes admin/comptabilité/direction/secrétariat** : formulaire
  d'ajout en haut de la section "Comptes comptabilité / direction /
  administrateur". Un email avec mot de passe temporaire est envoyé
  automatiquement. Un compte Comptabilité ou Secrétariat peut être
  basculé de l'un à l'autre à tout moment via un sélecteur sur sa ligne
  (droits identiques, seul le calendrier d'emails automatiques change —
  voir `INFRASTRUCTURE.md` section 7) ; Admin et Direction ne sont
  volontairement pas basculables.
- **Profs** : ajout individuel, ou import du planning annuel (voir
  ci-dessous) qui crée les profs sans compte actif ("dans le
  trombinoscope") — il faut ensuite renseigner leur email un par un pour
  activer leur accès et déclencher l'envoi des identifiants.
- **Cours** : depuis `/admin/cours`, formulaire d'ajout, ou modification
  d'un cours existant pour lui assigner un·e titulaire ou des
  participant·es supplémentaires (musicien·ne, co-enseignant·e).
- **Suppression** : chaque liste (comptes, profs, cours) a un bouton
  "Supprimer" avec confirmation en deux étapes. Les deux comptes admin
  protégés ne peuvent pas être supprimés, par sécurité.

## Importer le planning annuel

`/admin/administration` → section "Import annuel du planning" → charger
le fichier Excel source. Chaque prof est identifié par son
`analyticCode` (le "code analytique" de l'Excel) : si ce code existe
déjà, le cours/prof est mis à jour ; sinon, un nouveau prof est créé sans
compte actif (email à renseigner ensuite).

## Retrouver un rapport Excel d'un mois passé

`/admin/rapports` (ouvert à tous les comptes backend) : une ligne par
mois, avec un lien de téléchargement pour le rapport du verrouillage (le
20) et un pour le résumé final (le 26). Ce sont des instantanés archivés
au moment de l'envoi — pas un recalcul à la demande comme le bouton
"Exporter tout" de la vue d'ensemble, qui lui donne toujours l'état actuel
des données. Un mois n'apparaît avec un lien que si le cron a bien tourné
ce jour-là (voir "Vérifier que le cron tourne correctement" ci-dessous) ;
avant le 08.10.2026 (date d'ajout de cette archive), aucun rapport n'a été
sauvegardé, donc rien n'apparaît pour les mois antérieurs.

## Vérifier que le cron tourne correctement

Le cron (`/api/cron/daily`) doit être appelé au moins une fois par heure
par cron-job.org pour que les actions du cycle mensuel (création des
déclarations, rappels, verrouillage) se déclenchent au bon moment.

1. Se connecter sur **cron-job.org**, ouvrir la tâche "dance area".
2. Vérifier qu'elle est **activée** (pas en pause) — cron-job.org
   désactive automatiquement une tâche après une série d'échecs
   consécutifs (401, 500, timeout...).
3. Onglet "Historique" : les dernières exécutions doivent afficher
   `200 OK`. Un `401` signifie que l'en-tête `Authorization: Bearer
   <CRON_SECRET>` ne correspond plus à la variable `CRON_SECRET`
   configurée dans Vercel (par exemple après une régénération du secret
   sans mise à jour de cron-job.org, ou l'inverse).
4. On peut aussi utiliser le bouton "Effectuer un test" de cron-job.org
   pour déclencher un appel immédiat et voir la réponse en direct, sans
   attendre la prochaine exécution planifiée.
5. Cette configuration a été mise en place et vérifiée le 13 septembre
   2026 (réponse `200 OK` confirmée).

## Consulter les logs de l'application

Vercel → le projet → onglet "Logs" (ou "Observability" selon la version
de l'interface) : logs en temps réel des routes API, y compris les
erreurs d'envoi d'email ou de connexion à la base de données. Filtrer par
route (ex. `/api/cron/daily`) pour isoler un problème précis.

## Sauvegarder la base de données

Neon effectue des sauvegardes automatiques (point-in-time recovery selon
le plan souscrit — vérifier la rétention exacte dans la console Neon,
onglet "Backups" / "Branching"). Pour une sauvegarde manuelle ponctuelle
avant une opération risquée (migration, nettoyage de données) :

```bash
pg_dump "$DATABASE_URL" > sauvegarde-$(date +%Y-%m-%d).sql
```

À exécuter depuis une machine ayant `pg_dump` installé (version
compatible PostgreSQL 15+), avec la vraie valeur de `DATABASE_URL`
(jamais dans un fichier commité).

## Accéder directement à la base de données

Neon fournit un éditeur SQL dans sa console web (onglet "SQL Editor") —
pratique pour un dépannage ponctuel sans avoir besoin d'outil
supplémentaire. Exemples utiles :

```sql
-- Voir tous les comptes admin et leur statut
SELECT id, name, email, role, active FROM "AdminUser";

-- Réactiver un compte
UPDATE "AdminUser" SET active = true WHERE email = 'quelquun@dancearea.ch';

-- Voir les dernières exécutions du cron
SELECT * FROM "CronRun" ORDER BY "ranAt" DESC LIMIT 20;
```

## Si un prof ne reçoit pas ses emails

1. Vérifier que son adresse email est correcte dans sa fiche
   (`/admin/profs/[id]`) et qu'elle est bien renseignée (un prof sans
   email ne reçoit ni identifiants, ni rappels).
2. Vérifier que les variables `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
   `SMTP_PASSWORD` sont correctes dans Vercel — un mot de passe SMTP
   changé côté Infomaniak sans être répercuté dans Vercel est la cause la
   plus fréquente.
3. Regarder les logs Vercel de la route concernée (`/api/cron/daily`,
   `/api/admin/teachers`, `/api/auth/mot-de-passe-oublie`...) : un échec
   d'envoi y est systématiquement journalisé (`console.error`) sans faire
   planter le reste du traitement.
4. Vérifier aussi le dossier spam du destinataire, et que la boîte
   `no-reply@dancearea.ch` n'a pas atteint une limite d'envoi
   Infomaniak.

## Rotation du `SESSION_SECRET` ou du `CRON_SECRET`

- **`SESSION_SECRET`** : à changer uniquement en cas de suspicion de fuite.
  Générer une nouvelle valeur (`openssl rand -base64 48`), la mettre à
  jour dans Vercel, redéployer. Effet : tout le monde est déconnecté et
  doit se reconnecter — à faire volontairement, pas par surprise (prévenir
  l'équipe avant si possible).
- **`CRON_SECRET`** : à changer aussi rarement que possible. Si on le
  change, il faut mettre à jour **les deux côtés en même temps** : la
  variable Vercel (puis redéployer) **et** l'en-tête `Authorization` dans
  la configuration de la tâche cron-job.org — sinon le cron se remet à
  échouer en 401.

## Nettoyage restant de l'audit de sécurité

Un fichier contenant des codes de récupération Vercel a été repéré hors
du dépôt et déplacé (mais pas supprimé) dans
`~/Desktop/dance area/app/_to_delete/recovery-codesvercel.txt` sur
l'ordinateur de Rene. **À faire dès que possible** : copier ces codes
dans un gestionnaire de mots de passe, puis supprimer définitivement ce
dossier `_to_delete/`.
