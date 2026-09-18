# Infrastructure — Décompte mensuel Dance Area

Document de référence technique. Dernière mise à jour : 13 septembre 2026.

## 1. Vue d'ensemble

L'application "Décompte mensuel" permet aux profs et musicien·nes de Dance
Area de déclarer chaque mois les changements survenus sur leur planning
(remplacements, absences), et à l'administration de suivre, vérifier et
exporter ces déclarations. Le cycle est entièrement automatisé : création
des déclarations en début de mois, rappels par email, verrouillage et
soumission automatique à la deadline.

```
┌──────────────┐        HTTPS        ┌───────────────────────┐
│  Navigateur   │ ──────────────────▶ │   Vercel (hébergement)│
│ (prof/admin)  │ ◀────────────────── │   Next.js 14 (App     │
└──────────────┘                      │   Router) + API routes│
                                       └──────────┬────────────┘
                                                  │ Prisma (SQL)
                                                  ▼
                                       ┌───────────────────────┐
                                       │  Neon — PostgreSQL     │
                                       │  (base de données)     │
                                       └───────────────────────┘

┌────────────────┐   GET + Bearer token   ┌───────────────────────┐
│  cron-job.org   │ ─────────────────────▶ │ /api/cron/daily        │
│ (planificateur  │                        │ (logique du cycle      │
│  externe, ~1x/h)│                        │  mensuel)               │
└────────────────┘                        └──────────┬────────────┘
                                                       │ nodemailer
                                                       ▼
                                            ┌───────────────────────┐
                                            │  SMTP Infomaniak       │
                                            │  (emails aux profs)    │
                                            └───────────────────────┘
```

## 2. Stack technique

| Couche | Technologie | Détail |
|---|---|---|
| Framework | Next.js 14.2.35 (App Router) | Pages serveur + routes API dans le même projet |
| Langage | TypeScript | Tout le code source |
| Base de données | PostgreSQL (hébergée chez Neon) | Accès via Prisma ORM 5.20 |
| Authentification | iron-session (cookies chiffrés) | Pas de service tiers (Auth0, Clerk, etc.) |
| Mots de passe | bcryptjs (coût 12) | Hashés, jamais stockés en clair |
| Emails | nodemailer + SMTP Infomaniak | Boîte `rene.torres@dancearea.ch` |
| QR code | librairie `qrcode` | Génère le QR d'accès affiché à l'école |
| Hébergement | Vercel | Déploiement automatique à chaque push sur `main` |
| Planificateur (cron) | cron-job.org (service externe gratuit) | Vercel Cron n'est pas utilisé (nécessiterait un plan payant pour une fréquence horaire) |
| Dépôt de code | GitHub — `Renetoco/dance-area-decompte` | Source de vérité du code |

Aucune dépendance à un service payant autre que l'hébergement Vercel et la
base Neon (tous deux ont un plan gratuit suffisant pour ce volume d'usage).

## 3. Hébergement et déploiement

- Le code vit sur GitHub (`github.com/Renetoco/dance-area-decompte`).
- Vercel est connecté à ce dépôt : **chaque push sur la branche `main`
  déclenche automatiquement un nouveau déploiement en production.** Il n'y
  a pas d'étape manuelle de mise en ligne.
- Les variables d'environnement (secrets, connexion base de données, etc.)
  sont configurées dans Vercel → Settings → Environment Variables, **pas**
  dans le code. Voir `VARIABLES-ENVIRONNEMENT.md` pour le détail de chacune.
- **Important : Vercel ne relit les variables d'environnement qu'au moment
  d'un déploiement.** Si on ajoute ou modifie une variable, il faut
  redéclencher un déploiement (un simple push, ou "Redeploy" dans
  l'interface Vercel) pour qu'elle soit prise en compte.
- Le site tourne en HTTPS par défaut (géré par Vercel), avec des en-têtes
  de sécurité supplémentaires définis dans `next.config.mjs`
  (anti-clickjacking, HSTS, CSP — voir section Sécurité).

## 4. Base de données

Hébergée chez **Neon** (PostgreSQL serverless). Le schéma est défini dans
`prisma/schema.prisma` et versionné via des migrations Prisma
(`prisma/migrations/`). Modèles principaux :

- **Teacher** — profs et musicien·nes. Champ `analyticCode` = code
  analytique de l'Excel source (clé pivot pour l'import annuel du
  planning). `role` distingue `ENSEIGNANT` (titulaire d'un cours) de
  `MUSICIEN` (accompagnateur·rice). `active` permet de désactiver un
  compte sans le supprimer. `ajbTeacher` (coché à la main, voir section 6)
  fait apparaître le champ "cours AJB" et l'entrée tardive AJB dédiée dans
  le décompte de ce prof.
- **Course** — les cours du planning (code, catégorie, nom, jour, horaire,
  quota, prof titulaire). `isAJB` (coché à la main sur la fiche du cours)
  sort ce cours du calcul automatique du·de la titulaire — voir section 6.
- **CourseParticipant** — table de liaison pour les personnes
  supplémentaires rattachées à un cours (musicien·ne accompagnateur·rice,
  co-enseignant·e), en plus du·de la titulaire. Pas concernée par
  l'exclusion `isAJB` : un·e musicien·ne rattaché·e à un cours AJB continue
  de déclarer normalement dessus.
- **MonthlyDeclaration** — une déclaration = un·e prof + une période
  (`"2026-09"` = du 27 août au 26 septembre 2026 — voir "Période de paie"
  dans la section 6). Statut : `DRAFT` (en cours), `SUBMITTED_MANUAL`
  (soumis par le prof), `SUBMITTED_AUTO` (verrouillé automatiquement à la
  date limite). `ajbCourseCount` (nullable) = nombre de cours AJB donnés
  pendant la période, saisi à la main par les profs `ajbTeacher` ; `null` =
  pas encore rempli (0 cours AJB pris en compte tant que rien n'est saisi).
- **DeclarationItem** — une ligne de changement dans une déclaration
  (remplacement effectué, absence remplacée/non remplacée, autre), liée
  au cours concerné, à la date, à l'autre prof éventuellement impliqué, aux
  heures et à un commentaire. Le champ `tardif` marque une ligne saisie
  après la date limite mais avant la fin de la période (voir section 6) —
  la déclaration déjà soumise n'est pas rouverte pour l'accueillir.
- **AjbLateEntry** — un cours AJB donné en dernière minute (20-26), saisi
  en texte libre (date, heure, nom du cours, commentaire) plutôt que
  rattaché à un `Course` existant, puisque les remplacements AJB ne
  correspondent pas toujours à une séance planifiée. Compte pour +1 dans
  le total AJB du mois, comme les lignes `tardif` classiques.
- **AdminUser** — comptes admin/comptabilité/direction, avec rôle
  (`ADMIN`, `COMPTABILITE`, `DIRECTION`). `canManageCourses` (réglage
  individuel, indépendant du rôle) autorise en plus à gérer les cours et
  les profs/musicien·nes (ajout, désactivation/réactivation, suppression,
  titulaire, rattachements) — voir section 5.
- **ReminderLog** — trace de chaque email de rappel/notification envoyé
  (évite les doublons et sert d'historique).
- **CronRun** — verrou technique : empêche le cron de rejouer deux fois la
  même action le même jour, même s'il est déclenché plusieurs fois.
- **RateLimit** — compteur de tentatives (login, mot de passe oublié) pour
  la protection anti-brute-force (voir Sécurité).
- **AdminActionLog** — journal des actions structurelles backend (cours,
  profs, musicien·nes, comptes) — demande de Rene du 18.09.2026, pour
  pouvoir tracer qui a modifié quoi et corriger en cas d'erreur, maintenant
  que cette gestion est ouverte à plus de comptes. `adminName`/`adminRole`
  sont dupliqués (pas de relation) pour rester lisibles même si le compte
  est renommé ou supprimé plus tard. Écrit par `logAdminAction()` dans
  `src/lib/auditLog.ts` (best-effort : un échec d'écriture du journal ne
  fait jamais échouer l'action elle-même), consultable uniquement par
  `ADMIN` sur `/admin/journal`.

La suppression d'une `MonthlyDeclaration` supprime automatiquement ses
`DeclarationItem` associés (cascade) — utilisé par le bouton admin
"Effacer" une déclaration.

## 5. Authentification et rôles

Deux types de comptes, avec la même mécanique de session (cookie signé,
`iron-session`) mais des durées différentes :

- **Comptes prof** (`Teacher`) : session valable 30 jours (connexion
  ponctuelle, une fois par mois).
- **Comptes admin** (`AdminUser`) : session valable 8 heures seulement,
  car ces comptes ont plus de privilèges. Trois rôles :
  - `ADMIN` — accès complet : gestion des comptes (profs, comptabilité,
    direction, autres admins), gestion des cours, import annuel du
    planning, QR code, suppression de déclarations.
  - `COMPTABILITE` — tableau de bord des déclarations + export Excel.
  - `DIRECTION` — tableau de bord des déclarations + export Excel (même
    accès que `COMPTABILITE`, élargi le 16.09.2026 pour Anastasia).

  Les trois rôles peuvent modifier le nom, le jour, l'horaire et le
  statut AJB d'un cours existant depuis sa fiche (`PATCH
  /api/admin/courses/[id]`, élargi le 17.09.2026 puis le 18.09.2026 pour
  le statut AJB) — le code du cours (identifiant analytique unique,
  référencé par les déclarations) n'est volontairement pas modifiable
  depuis cet écran.

  L'ajout, la désactivation/réactivation et la suppression de cours et de
  profs/musicien·nes, le changement de titulaire d'un cours, et les
  rattachements musicien·ne/co-enseignant·e (sur la fiche du cours comme
  sur la fiche du prof, les deux vues restant toujours cohérentes puisque
  ce sont les mêmes endpoints) sont réservés à `ADMIN`, ou à un compte
  `COMPTABILITE`/`DIRECTION` avec le réglage individuel `canManageCourses`
  (voir `canManageCourses()` dans `src/lib/auth.ts`) — accordé le
  18.09.2026 à Aurélie, Laure et Marine, sans l'ouvrir à tout le rôle pour
  éviter tout effet de bord sur d'éventuels autres comptes ; élargi le
  18.09.2026 de la seule gestion des cours à celle des profs/musicien·nes
  (onglet `/admin/profs`, qui remplace l'ancien tableau "Comptes des
  profs" réservé à `ADMIN` dans `/admin/administration`). La suppression
  (cours ou prof) reste bloquée dès qu'un historique existe (changement
  déclaré, participation, etc., pour ne jamais perdre de données) — le
  bouton "Désactiver" (réversible via "Réactiver") remplace la suppression
  dans ce cas. La gestion des comptes admin/comptabilité/direction
  eux-mêmes (création, rôle, `canManageCourses`, désactivation) reste
  réservée à `ADMIN` seul, sur `/admin/administration`.

  Toutes ces actions structurelles sont enregistrées dans
  `AdminActionLog` (voir section 4), consultable sur `/admin/journal`
  (réservé à `ADMIN`).

Deux comptes admin sont **protégés** dans le code (`isProtectedAdminEmail`
dans `src/lib/auth.ts`) : `rene.torres@dancearea.ch` et
`anastasia@dancearea.ch`. Ils ne peuvent être ni désactivés ni supprimés
par personne, afin de garantir qu'il reste toujours au moins un accès
admin/direction fonctionnel.

Un nouveau compte (prof ou admin) reçoit un mot de passe temporaire par
email et est obligé d'en choisir un nouveau à la première connexion
(`mustResetPwd`).

## 6. Automatisation du cycle mensuel (cron)

Toute la logique vit dans `src/lib/cronJobs.ts` et `src/lib/dates.ts`, et
est déclenchée par la route `GET /api/cron/daily`. Cette route est
protégée par un secret partagé (`CRON_SECRET`) transmis en en-tête
`Authorization: Bearer <secret>` — sans ce secret, la route répond
`401 Non autorisé`.

**Le service externe cron-job.org appelle cette route au moins une fois
par heure.** À chaque appel, la fonction regarde l'heure actuelle à Genève
(fuseau `Europe/Zurich`) et déclenche l'action correspondante si c'est le
bon moment — une table `CronRun` empêche qu'une action soit rejouée deux
fois le même jour :

| Moment (heure de Genève) | Action |
|---|---|
| Le 27 du mois (début de la période) | Crée une déclaration vierge (`DRAFT`) pour chaque prof actif |
| Le 16 à 9h (J-4) | Envoie un rappel par email aux profs dont la déclaration du mois est encore totalement vide (aucune entrée, aucune réponse à "y a-t-il eu des changements ?") |
| Le 20 à 9h (J-0, matin de la date limite) | Dernier rappel : envoyé à tous les profs n'ayant pas encore soumis manuellement, même avec un brouillon en cours (dernier filet avant la clôture) |
| Le 20 à 21h (date limite) | Verrouille toutes les déclarations non soumises manuellement, les marque `SUBMITTED_AUTO`, notifie chaque prof par email, puis envoie le mail de clôture (résumé + Excel) à Admin/Comptabilité/Direction |

### Période de paie (27 → 26) et fenêtre tardive

Précision de la comptabilité du 17.09.2026 : la vraie période de paie va
du **27 du mois précédent au 26 du mois de la période** (ex. la période
`"2026-09"` couvre le 27 août au 26 septembre 2026) — et non du 1er au 20
comme avant cette date. Le calendrier prévisionnel de cours (base du
décompte, voir `occurrenceDatesInPeriod` dans `dates.ts`) couvre donc
toute cette fenêtre, ce qui laisse une queue de 6 jours (21-26) après la
date limite de soumission (le 20) :

- **Avant la date limite** : un prof peut déjà déclarer un changement prévu
  sur cette queue (21-26) — ça n'a rien de spécial, c'est juste une date
  future dans le calendrier de la période.
- **Après la date limite (20 à 21h) et jusqu'au 26 inclus** : la
  déclaration déjà soumise (manuellement ou automatiquement) reste
  verrouillée telle quelle, mais le prof peut encore signaler un
  changement de dernière minute depuis sa page — chaque ligne ajoutée dans
  ce créneau est marquée `tardif` en base, et un email est envoyé à tous
  les comptes `COMPTABILITE`/`DIRECTION` actifs pour qu'ils décident de
  l'inclure sur le salaire du mois courant ou de le reporter au mois
  suivant (repérable dans l'export Excel, colonnes "Tardif").
- **Après le 26** : la période est totalement close, plus aucune saisie
  n'est possible (ni normale, ni tardive).

### Cours AJB (Area Jeune Ballet)

Demande de la comptabilité du 18.09.2026 : les cours AJB changent trop
souvent (jours, horaires, profs) pour être comptés de façon fiable par le
calendrier prévisionnel automatique. Un cours coché `isAJB` (sur sa fiche,
section 5) sort donc du calcul automatique du·de la titulaire — mais pas
des participations en tant que musicien·ne/co-enseignant·e
(`CourseParticipant`), qui continuent de fonctionner normalement.

Pour compenser, chaque prof marqué `ajbTeacher` (coché à la main sur sa
fiche) voit apparaître dans son décompte :
- un champ chiffré **"cours AJB donnés"** (`MonthlyDeclaration.ajbCourseCount`),
  ajouté directement au total du mois ; `null` (rien saisi) = 0 pris en
  compte — volontaire, pour inciter à toujours remplir ce champ ;
- entre la date limite (20 à 21h) et la fin de la période (26 à 23h59),
  une option **"cours AJB tardif"** distincte du changement tardif général
  (texte libre pour le nom du cours, plus date/heure/commentaire —
  `AjbLateEntry`), qui déclenche la même alerte email à
  `COMPTABILITE`/`DIRECTION` que les autres entrées tardives et compte
  elle aussi pour +1 dans le total du mois.

Le rappel par email de ces profs inclut un paragraphe spécifique
expliquant tout ceci. Le résumé Excel (colonnes "Cours AJB (mois)" et
"AJB rempli ?") et le mail de clôture (section 7) permettent à la
comptabilité de repérer d'un coup d'œil qui a bien rempli son champ.

## 7. Emails

Sept types d'emails, tous envoyés via `src/lib/email.ts` (SMTP
Infomaniak, adresse d'expédition configurable via `MAIL_FROM`) :

1. **Bienvenue** — à la création d'un compte, avec identifiant + mot de
   passe temporaire.
2. **Réinitialisation** — après un "mot de passe oublié", nouveau mot de
   passe temporaire.
3. **Rappel** (J-4 puis le matin de J-0) — avant la date limite ; inclut un
   paragraphe spécifique pour les profs `ajbTeacher` (voir section 6).
4. **Notification de soumission automatique** — après la date limite, si
   la déclaration a été verrouillée sans action du prof.
5. **Alerte entrée tardive** — aux comptes `COMPTABILITE`/`DIRECTION`,
   quand un prof signale un changement après la date limite (voir
   "Période de paie et fenêtre tardive" en section 6).
6. **Alerte cours AJB tardif** — même principe que l'alerte entrée tardive
   ci-dessus, spécifique aux cours AJB signalés en texte libre (voir
   "Cours AJB" en section 6).
7. **Mail de clôture** — à Admin/Comptabilité/Direction, juste après le
   verrouillage du 20 à 21h : fichier Excel du cycle en pièce jointe, plus
   un résumé dans le corps (envois auto/manuels, profs ayant déclaré des
   changements, profs `ajbTeacher` ayant rempli ou non leur champ AJB).

Les noms de profs sont échappés avant insertion dans le HTML de l'email
(protection contre l'injection de balisage).

## 8. Sécurité

Un audit de sécurité complet a été réalisé le 12 septembre 2026
(voir `SECURITY-REVIEW.md` à la racine du dépôt, qui garde le détail
technique complet de chaque point). Résumé des protections en place :

- **`SESSION_SECRET` obligatoire** : l'application refuse de démarrer si
  cette variable est absente ou trop courte (moins de 32 caractères) — il
  n'y a plus de valeur par défaut codée en dur.
- **Limitation des tentatives (rate limiting)**, basée sur la base de
  données (pas de service externe) : 5 tentatives de connexion par email
  et 20 par IP sur 15 minutes ; 3 demandes de réinitialisation par compte
  et 10 par IP et par heure.
- **Mots de passe temporaires robustes**, générés avec un générateur
  aléatoire cryptographique (~360 millions de combinaisons possibles).
- **Protection contre l'injection de formule CSV** (un commentaire du
  type `=CMD(...)` ne peut plus s'exécuter à l'ouverture dans Excel).
- **En-têtes de sécurité HTTP** : anti-clickjacking, HSTS, CSP, anti-sniffing.
- **Rotation forcée du mot de passe** pour tout nouveau compte admin ou
  après réinitialisation.
- **Session admin courte (8h)** contre 30 jours pour les profs.
- Chaque route API vérifie systématiquement les droits (`requireTeacher` /
  `requireAdmin`) ; aucune route trouvée sans contrôle d'accès lors de
  l'audit. Les requêtes à la base de données passent toutes par Prisma
  (paramétrées), donc pas de risque d'injection SQL classique.

**Point resté en suspens lors de l'audit** : un fichier contenant des
codes de récupération Vercel a été trouvé hors du dépôt
(`~/Desktop/dance area/app/recovery-codesvercel.txt`) et déplacé dans un
dossier `_to_delete/` faute de pouvoir être supprimé automatiquement à
l'époque. **Ce fichier doit être définitivement supprimé** après avoir
copié ces codes dans un gestionnaire de mots de passe — voir
`RUNBOOK.md`.

## 9. Parcours utilisateur — vue d'ensemble des écrans

**Côté prof** (`/prof`) :
- Écran d'accueil : rappel des cours dont le/la prof est titulaire, liste
  des entrées déjà soumises ce mois-ci (modifiables jusqu'à la deadline),
  question "avez-vous eu des changements ce mois-ci ?" — un "Oui" ouvre
  directement le formulaire d'ajout (pas de clic supplémentaire).
- Formulaire d'ajout : type de changement, cours concerné (la date et les
  heures se pré-remplissent automatiquement selon le jour/horaire habituel
  du cours choisi, restent modifiables), autre prof éventuellement
  impliqué, commentaire.
- Pour les profs `ajbTeacher` : un champ dédié "cours AJB donnés" (ajouté
  directement au total du mois), et entre la date limite et la fin de la
  période, une option "cours AJB tardif" à part (voir section 6).
- Après la deadline, la déclaration devient lecture seule ; un bouton
  "Voir l'historique" (`/prof/historique`) permet de consulter les mois
  précédents.
- `/prof/mot-de-passe` : changement de mot de passe obligatoire à la
  première connexion.

**Côté admin/comptabilité/direction** (`/admin`) :
- Vue d'ensemble : tableau de bord filtrable (période, statut, changements,
  recherche) de toutes les déclarations, avec un indicateur de
  concordance (🟢/🔴/🟠/⚪) qui vérifie que les remplacements déclarés par
  un prof correspondent à ce que l'autre prof cité a lui-même déclaré.
  Export Excel (classeur complet ou sélection de profs cochés dans une
  grille dédiée) pour `ADMIN`, `COMPTABILITE` et `DIRECTION`.
- `/admin/cours` : gestion des cours (modification pour les trois rôles ;
  ajout, désactivation/réactivation, suppression, changement de titulaire
  et gestion des participant·es supplémentaires réservés à `ADMIN` ou un
  compte `canManageCourses`). Une case à cocher permet d'afficher aussi
  les cours désactivés, pour les réactiver.
- `/admin/profs` (ouvert aux trois rôles, comme `/admin/cours` ; remplace
  l'ancien tableau "Comptes des profs" de `/admin/administration`) :
  liste des profs et musicien·nes — ajout, changement de rôle, case
  `ajbTeacher`, activation/réinitialisation de compte, désactivation/
  suppression réservés à `ADMIN` ou un compte `canManageCourses`.
- `/admin/profs/[id]` : fiche d'un prof — cours dont il/elle est
  titulaire et interventions comme musicien·ne/co-enseignant·e
  (ajout/retrait réservés à `ADMIN` ou un compte `canManageCourses` ; les
  mêmes endpoints que `/admin/cours/[id]`, donc les deux vues restent
  toujours cohérentes entre elles), historique complet de ses
  déclarations (avec bouton "Effacer" pour une déclaration de test ou une
  erreur de saisie).
- `/admin/administration` (réservé au rôle `ADMIN`) : QR code d'accès à
  imprimer, import annuel du planning, gestion des comptes admin/
  comptabilité/direction (rôle, réglage `canManageCourses`, et les deux
  comptes protégés qui ne peuvent être ni désactivés ni supprimés).
- `/admin/journal` (réservé au rôle `ADMIN`) : historique chronologique de
  toutes les actions structurelles backend (cours, profs, musicien·nes,
  comptes) — qui a fait quoi et quand, pour pouvoir corriger en cas
  d'erreur (voir `AdminActionLog` en section 4).

Un bouton de thème clair/sombre est disponible sur l'ensemble de
l'application (préférence mémorisée dans le navigateur).

## 10. Documents complémentaires

- `VARIABLES-ENVIRONNEMENT.md` — détail de chaque variable à configurer.
- `RUNBOOK.md` — procédures pas à pas pour les opérations courantes.
- `HANDOFF.md` — état du projet, accès nécessaires, points d'attention.
- `SECURITY-REVIEW.md` (racine du dépôt) — détail technique complet de
  l'audit de sécurité.
