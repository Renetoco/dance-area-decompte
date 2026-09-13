# Document de passation — Décompte mensuel Dance Area

Rédigé le 13 septembre 2026, à la demande de Rene Torres, une fois le
cycle complet (déclarations, rappels, verrouillage automatique) vérifié
fonctionnel de bout en bout.

## 1. En une phrase

Application web interne (Next.js + PostgreSQL, hébergée sur Vercel) qui
remplace un suivi manuel Excel des remplacements/absences des profs de
Dance Area par un formulaire mensuel en ligne, avec rappels et
verrouillage automatiques.

## 2. Statut actuel

**Fonctionnel et vérifié.** Le point qui bloquait l'automatisation
(l'authentification du cron externe) a été résolu et testé avec succès le
13 septembre 2026 (réponse `200 OK` de `/api/cron/daily`). À partir de
cette date, on peut s'attendre à ce que :

- une déclaration vierge soit créée pour chaque prof actif le 1er de
  chaque mois ;
- des emails de rappel partent les 16, 18 et 19 de chaque mois à 9h
  (heure de Genève) aux profs n'ayant pas encore soumis ;
- toute déclaration non soumise soit verrouillée et auto-soumise le 20 à
  21h, avec notification par email.

Ces automatismes n'avaient probablement **jamais fonctionné correctement
avant cette date** (le cron échouait en 401 depuis sa mise en place — voir
section 5). Il est recommandé de surveiller les deux ou trois premiers
cycles mensuels pour confirmer que tout se déroule comme prévu (voir
`RUNBOOK.md` → "Vérifier que le cron tourne correctement").

Le reste des fonctionnalités (déclaration prof, tableau de bord admin,
gestion des comptes/cours, export CSV, historique) a été développé,
testé par Rene en conditions réelles, et est en production.

## 3. Accès nécessaires pour reprendre ou faire évoluer le projet

| Service | Rôle | Accès |
|---|---|---|
| **GitHub** — `Renetoco/dance-area-decompte` | Code source, historique des changements | Compte GitHub de Rene (`Renetoco`) |
| **Vercel** | Hébergement, déploiement, variables d'environnement, logs | Compte Vercel lié au dépôt GitHub |
| **Neon** | Base de données PostgreSQL | Compte Neon du projet |
| **cron-job.org** | Déclenche `/api/cron/daily` au moins une fois par heure | Compte cron-job.org de Rene |
| **Infomaniak** | Boîte mail `rene.torres@dancearea.ch` (envoi des emails de l'app) | Panneau Infomaniak |
| Gestionnaire de mots de passe | Codes de récupération Vercel (à y déplacer — voir section 6) | — |

Aucun de ces accès n'est partagé avec un tiers en dehors de Rene à ce
jour, à confirmer/organiser si une autre personne doit reprendre la
maintenance.

## 4. Historique du développement (résumé)

Le développement a été mené par itérations successives avec Claude,
au fil des besoins exprimés par Rene :

1. Mise en place initiale : modèle de données, authentification,
   formulaire de déclaration prof, tableau de bord admin, cron du cycle
   mensuel, emails.
2. Ajout de la gestion complète des comptes (admin, profs, cours) avec
   boutons de désactivation/suppression, et protection spéciale des deux
   comptes admin `rene.torres@dancearea.ch` et `anastasia@dancearea.ch`
   (ni désactivables, ni supprimables).
3. Amélioration de l'écran prof : auto-remplissage de la date et des
   heures selon le cours choisi, restructuration en "entrées du mois →
   question changements → cours en accordéon", bouton admin pour effacer
   une déclaration de test.
4. **Audit de sécurité complet** (12 septembre 2026, voir
   `SECURITY-REVIEW.md`) : `SESSION_SECRET` obligatoire, rate limiting,
   mots de passe temporaires renforcés, protection CSV, en-têtes de
   sécurité, rotation forcée des mots de passe admin. Tous les points
   corrigés sauf un (fichier de codes de récupération à déplacer
   manuellement, voir section 6).
5. Diagnostic et correction d'un blocage de connexion (compte
   désactivé par erreur) et de l'échec silencieux du cron externe
   (mauvaise configuration de l'en-tête d'autorisation côté
   cron-job.org / variable `CRON_SECRET` pas encore prise en compte par
   Vercel) — résolu le 13 septembre 2026.

## 5. Point d'attention le plus important : un seul flux de travail à la fois

À un moment du développement, **deux sessions Claude différentes ont
modifié le code du même dépôt en parallèle** sans se coordonner : une
session (celle-ci, sans accès direct pour pousser sur GitHub, livrant des
fichiers à appliquer manuellement) et une session Claude Code lancée
directement sur l'ordinateur de Rene (avec accès direct au dépôt). Cela a
provoqué une régression en production : une livraison de fichiers par
cette session a écrasé par erreur des corrections de sécurité qui
venaient d'être poussées directement par l'autre session, cassant le
build Vercel pendant un temps.

Le problème a été corrigé, mais **le risque reste réel si ce mode de
travail à deux outils en parallèle continue** : lors de la préparation de
cette documentation, un nouvel écart a d'ailleurs été constaté entre
cette session (en retard) et l'état réellement déployé sur GitHub —
sans conséquence ici puisque cette session n'a fait aucune livraison de
code cette fois, seulement de la documentation basée sur l'état réel du
dépôt (`origin/main`).

**Recommandation pour la suite :**
- Privilégier **un seul canal de modification du code à la fois** (soit
  cette session cowork, soit la session Claude Code locale — pas les
  deux en parallèle sur la même période).
- Si les deux doivent être utilisées, prévenir explicitement l'autre
  session/l'autre conversation avant de livrer un changement, pour
  qu'elle parte de l'état à jour (`git fetch origin` avant toute nouvelle
  modification).
- Le dépôt GitHub (`origin/main`) fait foi : c'est toujours lui qui est
  déployé sur Vercel, jamais une copie locale.

## 6. Action manuelle restante

Un fichier contenant des **codes de récupération Vercel** a été repéré
lors de l'audit de sécurité, en dehors du dépôt de code, sur
l'ordinateur de Rene :

```
~/Desktop/dance area/app/_to_delete/recovery-codesvercel.txt
```

Il a été déplacé dans ce dossier `_to_delete/` mais **pas supprimé**
(la protection du dossier connecté a refusé la suppression automatique).
**À faire :** copier ces codes dans un gestionnaire de mots de passe,
puis supprimer définitivement ce dossier.

## 7. Pistes d'amélioration futures (non bloquantes)

- Remplacer le "mot de passe oublié" actuel (qui écrase directement le
  mot de passe du compte) par un vrai lien de réinitialisation à durée
  limitée — plus propre architecturalement, mentionné comme piste dans
  `SECURITY-REVIEW.md` (non fait faute de besoin urgent, le rate limiting
  actuel rend déjà l'abus difficile).
- Ajouter des tests automatisés (aucun test actuellement, uniquement des
  vérifications manuelles + `npm run build`/`tsc`/`eslint` avant chaque
  livraison).
- Envisager une alerte automatique (email ou autre) si le cron
  cron-job.org repasse en échec, plutôt que de s'en apercevoir seulement
  en consultant le site cron-job.org.

## 8. Documents complémentaires

- `INFRASTRUCTURE.md` — description technique complète de la stack, du
  modèle de données et du cycle mensuel.
- `VARIABLES-ENVIRONNEMENT.md` — chaque variable d'environnement, son
  rôle, où la configurer.
- `RUNBOOK.md` — procédures pas à pas pour les opérations courantes
  (déployer, réactiver un compte, vérifier le cron, sauvegarder la base...).
- `SECURITY-REVIEW.md` (racine du dépôt) — détail technique complet de
  l'audit de sécurité du 12 septembre 2026.
