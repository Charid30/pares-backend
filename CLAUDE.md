# PARES — Portail d'Administration et de Ressources de la SONABHY

Instructions pour Claude Code. Ce fichier est lu automatiquement à chaque session, sur toute machine
(poste de développement comme serveur). Il remplace la mémoire locale de Claude : le mettre à jour
quand une règle métier change. Les règles métier ci-dessous servent de référence pour juger si une
donnée de production est « erronée » (ex. stage EN_COURS sans convention, renouvellement sans direction).

---

## ⚠️ Sur le serveur de PRODUCTION : procédure obligatoire

Objectif de l'utilisateur : analyser la base de production, corriger les données erronées et
remodeler ce qui doit l'être. Toute intervention suit **strictement** ces étapes, dans l'ordre :

1. **Sauvegarde complète AVANT toute écriture** — `mysqldump` de la base (+ copie du dossier `uploads/`),
   horodatée, dans un dossier hors de l'application. Vérifier que le fichier est complet
   (`-- Dump completed` en dernière ligne). Sans sauvegarde vérifiée : aucune écriture.
2. **Analyse en lecture seule** — uniquement des `SELECT`. Produire un **rapport** (fichier `.md`) :
   chaque anomalie avec la requête qui la prouve, le nombre de lignes concernées, la cause probable
   et la correction proposée. Aucune modification pendant cette phase.
3. **Validation par l'utilisateur** — présenter le rapport ; ne corriger **que** ce qu'il a validé,
   anomalie par anomalie. Ne jamais « nettoyer » de sa propre initiative.
4. **Corrections sous forme de scripts** — chaque correction = un script SQL dans
   `pares-backend/migrations/migration_prod_<description>.sql`, **idempotent**, dans une transaction
   (`START TRANSACTION … COMMIT`), avec en commentaire la requête de vérification avant/après et le
   moyen de revenir en arrière. Pas de requête d'écriture tapée à la main dans la console.
5. **Tester d'abord sur une copie** — restaurer la sauvegarde dans une base de test
   (ex. `pares_db_test`), y exécuter le script, vérifier le résultat. Seulement ensuite sur la vraie base.
6. **Application en production** — de préférence en dehors des heures d'utilisation, un script à la fois,
   avec vérification (`SELECT`) après chacun. Au moindre résultat inattendu : arrêter et prévenir.
7. **Remodelage du schéma** (tables, colonnes, relations) — idem, par migrations. Toute modification
   du schéma doit être **reportée dans le code** (modèles Sequelize, services) sur le poste de dev,
   testée, puis déployée ; le code et la base doivent rester cohérents.

Interdits sur le serveur, sauf demande explicite de l'utilisateur pour l'opération précise :
`DROP`, `TRUNCATE`, `DELETE` sans `WHERE`, suppression de fichiers dans `uploads/`, modification du code
de l'application en place, `npm install`, redémarrage des services. En cas de doute : ne pas lancer, demander.

---

## Méthode de travail (retours de l'utilisateur)

- **Toujours vérifier l'existant avant de modifier** : chercher qui appelle un endpoint ou un service
  (grep dans le frontend ET le backend). Ne jamais supposer qu'une fonctionnalité est absente.
- **Poser des questions** quand le flux métier n'est pas clair, plutôt que supposer.
  L'utilisateur répond en français ; répondre en français.
- Pour les remplacements de masse (sed), vérifier le résultat : un motif comme `Stage.count(`
  matche aussi `RenouvellementStage.count(` / `RapportStage.count(`.

---

## Stack et structure

- **Backend** : Node.js + Express 5 + Sequelize + MySQL — `pares-backend/` (dépôt Git)
- **Frontend** : Angular 21 (standalone, zoneless) + Tailwind — `pares-frontend/`
- **Auth** : JWT. `req.user.agentId` peut être non nul même pour un ADMIN (un admin peut avoir un profil agent).
- **Notifications** : Web Push (VAPID), emails via `notification.service.js` / `email.service.js`, in-app.
- **Jobs** : `setInterval` dans `src/jobs/` (ex. `stageStatusJob.js`, toutes les heures).

```
pares-backend/
├── migrations/          ← PROD : lus par `npm run migrate` (scripts/run-migrations.js)
├── src/{controllers,models,services,validators,jobs,routes}
│   └── migrations/      ← DEV manuel uniquement, NE PAS y écrire de nouvelles migrations
└── uploads/             ← fichiers déposés (documents de stage, lettres…)
pares-frontend/src/features/dashboard/
├── admin/               ← composants admin
├── agent/modules/       ← composants agent
└── candidat/            ← espace candidat
```

### Base de données en local (poste de dev uniquement)

- MySQL via XAMPP : `C:\xampp\mysql\bin\mysql.exe -u root pares_db` (root **sans** mot de passe en local).
- Pas de synchronisation automatique du schéma : ajouter une colonne = écrire une migration.
- Comptes de test locaux (base nettoyée le 2026-10-14) : `admin` / `candidat` (mot de passe communiqué hors dépôt).
  Sauvegarde d'avant nettoyage : `backups/`.

---

## Conventions de code (CRITIQUES)

### Migrations SQL
- **Toujours** dans `pares-backend/migrations/`, nommées `migration_prod_<description>.sql`.
- **Idempotentes** : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `INSERT IGNORE`…
  (l'historique `_migrations_history` évite de rejouer, mais un échec à mi-parcours doit pouvoir être relancé).

### Backend
- `getUserRoles(user)` est **synchrone** : jamais `await getUserRoles(...)`.
- Accès : ADMIN (et rôles système / lecture globale) → toutes les directions. Agent non-admin → toujours
  filtré par ses directions (`getAgentDirectionIds`, `assertAgentOwnsDirection`), même avec `lectureGlobale`
  pour les actions. Voir `getAgentContext`, `hasGlobalReadAccess`, `hasGlobalActionAccess` (stage.controller.js).
- `resolveAgentDirection(agentId)` retourne `number[]` → filtrer avec `{ [Op.in]: directionIds }`.
- Multi-directions : table `agents_directions` ; `agents.direction_iddirection` conservé (= 1re direction).
- Fichiers : `fileStorage.saveFile(buffer, nom, sousDossier)` (stockage disque, `*_path`) ;
  les colonnes BLOB ne sont qu'un repli pour les anciens fichiers (`fileStorage.readFile(path, blob)`).
- Upload d'un document de stage (`POST /stages/documents`) : **`dateEmission` est obligatoire**.

### Frontend Angular
- Respecter la syntaxe du fichier existant : composants admin récents en `@if`/`@for`,
  composants agent/anciens en `*ngIf`/`*ngFor`. Ne pas mélanger dans un fichier.
- Toasts : `this.showToast(...)` (`addToast` n'existe pas).
- Téléchargements protégés : passer par `HttpClient` (`responseType: 'blob'`) — `window.open(url)` n'envoie pas le JWT.
- Recherche : la barre « Rechercher… » du header admin diffuse le terme via `SearchService` (`term$`) ;
  les pages s'y abonnent (pas de champ de recherche local).
- Charte : rouge SONABHY `#c0392b` (survol `#96281b`), en-tête de modal en dégradé
  `linear-gradient(135deg, #c0392b, #96281b)`. **Pas de violet.** Boutons compacts (`text-xs`, `py-2 px-3`).
- Pages liste (modèle : `admin/stages/stages-list`) : en-tête avec bouton **[Filtres]** (icône entonnoir,
  panneau déroulant + badge du nombre de filtres actifs) et menu **[Exporter ▾]** ; cartes `app-stat-card` ;
  onglets de vue au-dessus du tableau ; ligne discrète de rappel des filtres actifs.

### Permissions
- Les permissions sont figées dans la session à la connexion : après un changement de permissions d'un rôle,
  l'agent doit se **reconnecter** (un F5 déclenche aussi `refreshUser()`).
- Rôles : ADMIN, CANDIDAT, TEST, APPROBATEUR DE STAGE, AGENT RH, ADMIN_RH (lecture globale).
- Module STAGE : CONSULTER, APPROUVER, VALIDER, REJETER, CREER (joindre une convention), MODIFIER, ATTESTER, TRANSFERER.

---

## Règles métier : stage

- Circuit demande de stage : EN_ATTENTE → (Traiter) EN_COURS_DE_TRAITEMENT → (Approuver, agent) PROGRAMMATION_EN_COURS
  → (Accepter + convention) ACCEPTE / EN_COURS → EXPIRE → rapport → TERMINE. Refus possible avant décision.
- **Un stage n'est validé que lorsque sa convention est jointe.** Statut après convention :
  **ACCEPTE** si la date de début n'est pas arrivée, **EN_COURS** si elle l'est (`statutApresConvention`).
  Le job n'active (ACCEPTE → EN_COURS) **que les stages ayant une convention**.
- Compteurs / statistiques / tableaux de bord : les **demandes** ne comptent que les stages racines
  (`stage_parent_idstage: null`) ; « en cours » compte tous les stagiaires réellement en stage (renouvellements inclus).

## Règles métier : renouvellement (validées le 2026-10-14)

- Le renouvellement est la **continuité / prolongation** de la demande de stage : nouveau stage (enfant,
  `stage_parent_idstage`) qui commence le lendemain de la fin du stage actuel.
- Ouvert au candidat **une semaine** avant la fin (`DELAI_RENOUVELLEMENT_JOURS = 7`, candidat.service.js
  + `peutRenouveler` dans candidat/stages/stages.ts). Stage déjà fini : autorisation admin de 7 jours.
- **Direction** : reprise de la demande de stage d'origine (remonte la chaîne si besoin).
- **Documents** : le candidat ne fournit que sa **lettre**. L'admin et l'agent voient la lettre + la
  **convention de la demande de stage** (`GET /stages/renouvellements/:id/convention-demande`).
- **Convention du renouvellement** : jointe par l'agent habilité (STAGE/CREER) ou l'admin sur le nouveau stage
  (document_stage), à l'acceptation ; affichée comme pour un stage (ligne « Convention jointe » + Voir / remplacer).
  Les colonnes `renouvellement_stage.conventionStageEnCours*` ne sont plus utilisées (à supprimer plus tard
  par migration après vérification en production).
- **Circuit comme les stages** :
  - Admin : **Traiter** (`PUT /stages/renouvellements/:id/traiter`) puis **Accepter / Refuser dès EN_ATTENTE**.
  - Agent : **Approuver** (EN_ATTENTE) → **Accepter** (PROGRAMMATION_EN_COURS, permission VALIDER) → **Refuser**
    (permission REJETER), dans ses directions, y compris les dossiers re-soumis.
  - Pas de bouton « Exiger un document ». Refus : seule la lettre peut être déclarée non conforme.
  - Rouvrir / annuler l'approbation / expirer / supprimer : **ADMIN uniquement** (pour le moment).
- Dates du renouvellement modifiables (accepté / en cours) via `PUT /stages/:idStageNouveau`, comme un stage.
- **Statut « Prolongé »** : stage initial expiré + renouvellement ACCEPTE/EN_COURS/SUSPENDU → affiché « Prolongé »
  (statut **calculé** `statutAffiche` ; en base `statusStage` reste EXPIRE). Il ne repasse « Expiré » qu'à la fin
  du renouvellement. Helper `enrichirAvecChaine` / `getInfosChaines` (stage.service.js).
- **Durée totale** = durée du stage + durées des renouvellements effectués (`chaine.dureeTotaleMois`).
- **Archives** : un stage initial n'y apparaît pas tant qu'un renouvellement de sa chaîne est actif
  (`getRacinesAvecRenouvellementActif`) ; la période affichée couvre toute la chaîne.

## Règles métier : rapport de stage (validées le 2026-10-20)

- **Un seul rapport pour toute la chaîne** (demande de stage + renouvellements), porté par le stage racine.
- **Point d'entrée unique** : `candidatService.soumettreRapportStage` (route `POST /candidat/stages/:id/rapport` ;
  l'ancienne `POST /stages/rapports` y est redirigée). Bouton « Rapport » côté candidat **uniquement sur la
  demande initiale**, piloté par `rapportInfo` renvoyé par le backend.
- Règle (`getEtatRapportChaine`, candidat.service.js) : rapport possible **seulement après la fin du dernier
  stage de la chaîne** (aucun renouvellement demandé / en traitement / approuvé / accepté / en cours / suspendu,
  dernier stage EXPIRE ou TERMINE). Renouvellements rejetés ou annulés ignorés.
- **Autorisation de l'admin** (ou agent VALIDER de la direction) : `PUT /stages/:id/autoriser-rapport`, 7 jours,
  table `autorisation_rapport_stage` (migration `migration_prod_autorisation_rapport.sql`) — même principe que
  l'autorisation de renouvellement ; le candidat peut alors soumettre à tout moment. Une soumission anticipée
  n'interrompt pas un stage encore en cours : seuls les stages finis passent RAPPORT_SOUMIS.

---

## Tests

- Backend : `npx jest --runInBand` (SQLite en mémoire via `resetDb`, mocker `../../utils/fileStorage.util`).
- 3 échecs connus et antérieurs, sans lien avec le renouvellement : `candidat.service.test.js` (date de repos
  écrite en dur) et `user.service.test.js` (anciens messages du multi-directions).
- Frontend : `npx ng build --configuration development` pour vérifier la compilation.

---

## Objectif de la mission sur le serveur

**Tout améliorer** : analyser la base de production et corriger les données erronées, remodeler ce qui doit
l'être (schéma + code cohérents), et **retirer tout le code mort**. L'utilisateur a demandé de ne rien
supprimer sur le poste de dev : le nettoyage se fait lors de la mission (en suivant la procédure ci-dessus
pour tout ce qui touche la base). Après chaque suppression : `npx ng build` + `npx jest --runInBand`.

### Code mort identifié (vérifié par recherche dans tout le projet, le 2026-10-17)

**Devenu mort suite aux changements du 2026-10-14 :**
- `pares-frontend/.../admin/stages/stages-list.ts` : `toggleFiltreEnCours()`, `toggleArchives()`
  (remplacés par les onglets `changerVue()`).
- Ancien modèle « Convention du stage en cours » fournie par le candidat (règle abandonnée) — toujours affiché
  « Convention non disponible » :
  - `admin/stages/stages-list.html` (~l.949-981) : bloc « Convention en cours » dans « Documents de renouvellement »
    + template `#noConventionRenouv` ; `stages-list.ts` : `accederConventionRenouvellement()`,
    alias `downloadConventionRenouvellement()`, entrée `conventionStageEnCours` de `DOCUMENTS_RENOUVELLEMENT`
    (garder l'entrée `lettreMotivationRenouvellement`).
  - `agent/modules/stage/agent-stage.html` (~l.838-864) : même bloc ; `agent-stage.ts` : champ
    `conventionStageEnCours_filename`, `accederConventionRenouvellement()`.
  - `core/services/admin-stage.service.ts` : champs `conventionStageEnCours_filename/_size` ;
    vérifier si `downloadConventionRenouvellement()` est encore appelé après nettoyage.
  - `candidat/stages/stages.ts` (~l.1299) : libellé `conventionStageEnCours`.
  - Backend : `'conventionStageEnCours'` dans `RENOUVELLEMENT_DOCUMENT_KEYS` (stage.validator.js) et la partie
    correspondante de `remplacerDocumentStage` (stage.service.js) — **la partie « lettre » est encore utilisée**
    (rejet d'un stage de renouvellement depuis l'écran Stages), ne pas la supprimer ;
    colonnes lues dans `RENOUV_ATTRS` de `getAllRenouvellements`.
  - Base : colonnes `renouvellement_stage.conventionStageEnCours`, `_filename`, `_size`, `_path` →
    vérifier en production qu'elles ne contiennent rien à conserver
    (`SELECT COUNT(*), SUM(conventionStageEnCours_filename IS NOT NULL) FROM renouvellement_stage;`),
    puis migration `ALTER TABLE … DROP COLUMN` (après sauvegarde, avec l'accord de l'utilisateur).

**Déjà mort avant :**
- `admin/stages/stages-list.ts` : `onSearch()` (ancienne recherche locale), `formatDateTime()`.
- `candidat/stages/stages.ts` : `closeCalendar()`, `niveauxSoutenance`, `niveauxPerfectionnement`, `telechargerConvention()`.
- `pares-backend/src/services/stage.service.js` : `getAutorisationActive()` (exporté, jamais appelé — les écrans
  ont leur propre version).
- Faire une passe complète sur le reste du projet (autres modules : aides, offres, audiences, agents…),
  non encore analysés.

### Autres points en attente

- 3 tests backend obsolètes à mettre à jour (voir « Tests »).
- `createRapport` (stage.service.js) n'est plus appelé (la route redirige vers candidat.service) : code mort.
- « Mes stages » côté candidat affiche encore le stage du renouvellement comme une carte à part (et le compte
  dans le total) — à décider avec l'utilisateur (regrouper la chaîne sur une seule carte ?).
- Notifications candidat manquantes : renouvellement « en traitement », convention du renouvellement jointe.
- Tests qui appellent des services envoyant des e-mails : toujours `jest.mock('../email.service')` et
  `jest.mock('../notification.service')`, sinon timeouts quand le SMTP est lent.

---

## Historique des modifications (session du 2026-10-14 au 2026-10-17, poste de dev)

### Base de données (locale)
- Migrations passées : `migration_prod_renouvellement_status.sql`, `…_created_date.sql` (manquaient en local),
  + 9 autres en attente. `migration_prod_stage_nom_maitre.sql` rendue idempotente (`ADD COLUMN IF NOT EXISTS`).
- Nouvelle migration : `migration_prod_renouvellement_en_traitement.sql` (statut `EN_COURS_DE_TRAITEMENT`).
  **À appliquer en production** (`npm run migrate`) avec les deux migrations renouvellement ci-dessus si absentes.
- Base locale entièrement nettoyée (configuration conservée : rôles, permissions, directions, services,
  paramètres, historique des migrations) ; comptes de test `admin` / `candidat`. Sauvegarde : `backups/`.

### Backend
- **Renouvellement** (stage.service.js, stage.controller.js, candidat.service.js, routes, validators) :
  - Liste filtrée par direction pour les agents + compteurs scopés + `peutAgir` ; stats `total, enAttente,
    enTraitement, approuve, accepte, enCours, expire, termine, rejete`.
  - Direction reprise de la demande d'origine (remontée de la chaîne) ; documents du stage d'origine copiés
    avec leur `*_path` (avant : perdus).
  - Lettre stockée sur disque (création et re-soumission) ; re-soumission = lettre seule.
  - `conventionNonConforme` ignoré à l'évaluation ; restriction « re-soumis = admin seul » supprimée.
  - Circuit : `PUT /renouvellements/:id/traiter` (admin) ; admin accepte dès EN_ATTENTE (`agentContext.isAdmin`),
    agent seulement après approbation ; accès global par permission pour les rôles lecture globale.
  - `GET /renouvellements/:id/convention-demande` (convention du stage actuel).
  - Synchronisation du statut du renouvellement avec son stage, y compris retour à ACCEPTE / EN_COURS
    après modification des dates.
  - Fenêtre de renouvellement 14 → 7 jours (`DELAI_RENOUVELLEMENT_JOURS`).
  - Route morte `POST /stages/renouvellements` (`createRenouvellement`) supprimée.
- **Stage** : `statutApresConvention` (convention jointe → ACCEPTE si date future, EN_COURS sinon), appliqué
  à `createDocumentStage` et à l'acceptation d'un renouvellement ; job : activation seulement avec convention.
- **Chaîne** : `getInfosChaines`, `enrichirAvecChaine` (statut « PROLONGE », durée totale) sur la liste des stages,
  le détail et les archives ; `getRacinesAvecRenouvellementActif` pour les archives.
- **Compteurs** : `getStagesStats`, `admin-dashboard.service.js`, `dashboard.service.js` limités aux demandes
  (`stage_parent_idstage: null`), sauf « en cours ».
- Tests ajoutés : `stage.resoumission.test.js` (circuit, convention, direction, archives, prolongé, durée),
  `candidat.service.renouvellement.test.js` (7 jours, direction, lettre sur disque), `stageStatusJob.test.js`
  (activation avec convention).

### Frontend
- **Admin Renouvellements** : liste remodelée comme Stages (3 cartes Total / En attente / Approuvés cliquables,
  recherche via la barre du haut, filtres en entonnoir, tableau 5 colonnes, badges convention) ; modal détail au
  design du stage (candidat, infos, dates modifiables, « Convention jointe » + Voir / remplacer, lettre +
  convention de la demande, Imprimer / ZIP) ; boutons Traiter / Accepter / Refuser / Annuler l'approbation /
  Joindre la convention / Rouvrir / Expirer / Supprimer ; modal d'acceptation / refus refait (récapitulatif,
  dates optionnelles, convention avec aperçu) ; erreurs affichées dans le modal ; `dateEmission` envoyée.
- **Agent Renouvellement** : traitement par permission et par direction, modal au design du stage
  (Approuver / Accepter / Refuser / convention), libellés et compteurs alignés, `dateEmission` envoyée.
- **Candidat** : modal de renouvellement aux couleurs SONABHY (plus de violet, boutons compacts, aperçu de la
  lettre et de la convention) ; aperçu des fichiers dans le récapitulatif de la demande de stage ;
  « Mes renouvellements » : lettre seule à la re-soumission, téléchargements via HttpClient (JWT),
  statut « En traitement ».
- **Admin Stages** : filtres en entonnoir, menu « Exporter ▾ » (Excel, PDF, Rapports), onglets
  Toutes / En cours / Archives, statut « Prolongé » + durée totale (liste et détail).
- **Admin Archives** : même présentation que Stages ; filtre de type corrigé (SOUTENANCE / PERFECTIONNEMENT
  au lieu de valeurs inexistantes) ; filtre direction ; période et durée de toute la chaîne.

### 2026-10-17
- **Agent Renouvellement** aligné sur l'admin : modal d'acceptation / refus au design SONABHY (récapitulatif,
  convention avec aperçu, message si pas la permission CREER) ; dates modifiables (permission MODIFIER, dans sa
  direction) ; ligne « Convention jointe » + Voir / remplacer (CREER) ; remplacement via `PUT /stages/:id/convention`.
- **Candidat « Mes stages »** : statut « Prolongé » et durée totale (liste + détail) — `getMesDemandesStage`
  appelle `enrichirAvecChaine` (exporté par stage.service.js).
- **Sécurité** (IDOR téléchargement des documents de stage) : corrigée — `buildDocumentStageAccess`
  (stage.controller.js) + `assertCanReadDocumentStage` (stage.service.js) : le candidat ne lit que ses propres
  documents, l'agent est cloisonné par direction (sauf rôle système / lecture globale), l'admin a un accès global.
  Tests : `stage.documentStage.access.test.js` (13 tests).
- `stage.resoumission.test.js` : e-mails et notifications simulés.
- `CLAUDE.md` est **versionné** dans `pares-backend/` (arrive sur le serveur avec `git pull`) ;
  `pares-frontend/CLAUDE.md` l'importe (`@../pares-backend/CLAUDE.md`). Aucun mot de passe dans ce fichier.
- **2026-10-20 — Rapport de stage** : point d'entrée unique et autorisation de l'admin (voir « Règles métier :
  rapport ») ; bloc « Autorisation de rapport » dans le détail d'un stage (admin et agent) ; bouton candidat
  piloté par `rapportInfo` avec message « Votre stage est prolongé jusqu'au … ».
  **Sécurité** : `PUT /stages/:id` (dates) et `PUT /stages/:id/convention` cloisonnés par direction pour les
  agents (`assertAgentOwnsDirection`) ; l'accès global MODIFIER ne permet pas de changer la direction.
  Écran agent « Stages » : statut « Prolongé ». Tests : `candidat.service.rapport.test.js` (14 tests).
- **Candidat « Mes renouvellements »** refondu sur le modèle de « Mes stages » : hero sombre (icône, titre,
  statistiques Total / En cours / Terminés), onglets Tous / En cours / Rejetés, cartes identiques aux stages
  (bandeau de rejet, pastille de statut, dates), sidebar « Comment ça marche ? », modal de détail au design
  SONABHY (infos, documents, progression) à la place de l'accordéon, modal de re-soumission en rouge SONABHY.

### 2026-10-21 — Travail sur la copie de la base de production
- La base locale `pares_db` est désormais une **copie de la production** (dump du 2026-10-20). Toute correction
  de la base = migration `migrations/migration_prod_*.sql`, appliquée ensuite sur le serveur par `npm run migrate`.
- La production n'avait pas `migration_prod_autorisation_rapport.sql` ni `…_renouvellement_en_traitement.sql` :
  le serveur tournait sur du code antérieur au 2026-10-17.
- **Renouvellements invisibles** (ex. NEBIE WEBIBE GERTRUDE) : `demanderRenouvellement` créait le stage enfant puis
  `renouvellement_stage` sans transaction → stages orphelins (468, 571) invisibles et candidat bloqué
  (« une demande existe déjà »). Corrigé : transaction + suppression de la lettre en cas d'échec (test ajouté).
  Données : `migration_prod_renouvellements_orphelins.sql` (direction reprise du parent, documents du parent pour
  les orphelins, ligne de renouvellement EN_ATTENTE sans lettre, `createdBy = 'Migration renouvellements orphelins'`).
  **À appliquer en production** avec les deux migrations ci-dessus.
- Constaté, non corrigé (à décider) : direction 8 sans agent (renouvellement n°10 visible de l'admin seul) ;
  statut du renouvellement ≠ statut de son stage enfant (n°2 à 7, 10) ; `renouvellement_stage.createdDate` NULL.
- **Convention jointe à l'acceptation d'un renouvellement jamais enregistrée** : en production
  `document_stage.document` était NOT NULL alors que le code écrit NULL (fichier sur disque) → tout INSERT de
  document (`POST /stages/documents` : conventions de renouvellement, attestations) échouait ; le renouvellement
  restait « Accepté » sans convention. Migration `migration_prod_document_stage_document_nullable.sql`
  (**à appliquer en production**). Écrans admin et agent : la convention est envoyée **avant** l'acceptation
  (si l'envoi échoue, rien n'est accepté ; erreur dans le modal) ; `conventionDejaJointe` évite un double envoi.
- Tests sur la copie de prod : couper e-mails et push (adresses réelles des candidats).
