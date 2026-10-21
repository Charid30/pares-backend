-- =============================================================================
-- Migration : suppression des colonnes mortes renouvellement_stage.conventionStageEnCours*
--
-- Ancien modèle abandonné : à la demande de renouvellement, la convention du stage d'origine
-- était recopiée dans le renouvellement. Depuis le 2026-10-12 plus rien n'y écrit, et depuis le
-- 2026-10-21 plus rien ne les lit (modèle Sequelize, services et écrans nettoyés).
--
-- Vérifié sur la copie de production du 2026-10-20 : 16 lignes renseignées sur 18, toutes des
-- copies identiques (nom, taille, chemin ou contenu) de la convention de la demande d'origine,
-- qui reste dans document_stage ; les 9 chemins disque sont aussi référencés par document_stage
-- (aucun fichier n'est orphelin, aucun fichier n'est supprimé).
--
-- ⚠️ Sauvegarde de la base AVANT application (procédure production, CLAUDE.md).
-- Vérification AVANT (doit renvoyer 0 ; sinon NE PAS appliquer et prévenir) :
--   SELECT COUNT(*) FROM renouvellement_stage r
--   LEFT JOIN document_stage d ON d.stage_idstage = r.stage_actuel_idstage
--        AND d.typeDocument = 'CONVENTION' AND d.del = 0
--   WHERE r.conventionStageEnCours_filename IS NOT NULL
--     AND NOT (r.conventionStageEnCours_filename <=> d.document_filename
--              AND r.conventionStageEnCours_size <=> d.document_size);
-- Vérification APRÈS (aucune ligne) :
--   SHOW COLUMNS FROM renouvellement_stage LIKE 'conventionStageEnCours%';
--
-- Retour arrière : recréer les colonnes (vides) ; les données sont dans la sauvegarde :
--   ALTER TABLE renouvellement_stage
--     ADD COLUMN conventionStageEnCours MEDIUMBLOB NULL AFTER lettreMotivationRenouvellement_path,
--     ADD COLUMN conventionStageEnCours_filename VARCHAR(255) NULL AFTER conventionStageEnCours,
--     ADD COLUMN conventionStageEnCours_size INT NULL AFTER conventionStageEnCours_filename,
--     ADD COLUMN conventionStageEnCours_path VARCHAR(500) NULL AFTER conventionStageEnCours_size;
--
-- DDL (pas de transaction possible) ; idempotent grâce à DROP COLUMN IF EXISTS.
-- =============================================================================

ALTER TABLE `renouvellement_stage`
  DROP COLUMN IF EXISTS `conventionStageEnCours`,
  DROP COLUMN IF EXISTS `conventionStageEnCours_filename`,
  DROP COLUMN IF EXISTS `conventionStageEnCours_size`,
  DROP COLUMN IF EXISTS `conventionStageEnCours_path`;
