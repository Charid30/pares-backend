-- =============================================================================
-- Migration : circuit du renouvellement (validé le 2026-10-21) — approbation automatique après 48 h
--
-- Circuit : En attente → (Approuver, agent de la direction ou admin ; sinon AUTOMATIQUEMENT après
-- 48 h sans évolution, stageStatusJob.approuverRenouvellementsAutomatiquement) → En cours de
-- programmation → convention jointe par la RH → Accepté / En cours. L'étape « En traitement » et le
-- bouton « Traiter » sont supprimés.
--
-- 1. Colonne dateEnAttente : début du délai de 48 h (soumission, re-soumission, réouverture,
--    annulation de l'approbation).
-- 2. Les renouvellements encore « En traitement » reviennent « En attente ».
-- 3. Les demandes déjà en attente reçoivent dateEnAttente = maintenant : elles attendent 48 h
--    après le déploiement avant toute approbation automatique (décision de l'administration).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS ; les mises à jour ne touchent que les lignes concernées.
-- Vérification APRÈS (doit renvoyer 0) :
--   SELECT COUNT(*) FROM renouvellement_stage
--   WHERE del = 0 AND statusRenouvellement = 'EN_ATTENTE' AND dateEnAttente IS NULL;
-- Retour arrière : ALTER TABLE renouvellement_stage DROP COLUMN dateEnAttente;
-- =============================================================================

ALTER TABLE `renouvellement_stage`
  ADD COLUMN IF NOT EXISTS `dateEnAttente` DATETIME NULL
    COMMENT 'Début du délai de 48 h avant approbation automatique'
    AFTER `statusRenouvellement`;

START TRANSACTION;

UPDATE `renouvellement_stage`
   SET `statusRenouvellement` = 'EN_ATTENTE'
 WHERE `del` = 0
   AND `statusRenouvellement` = 'EN_COURS_DE_TRAITEMENT';

UPDATE `renouvellement_stage`
   SET `dateEnAttente` = NOW()
 WHERE `del` = 0
   AND `statusRenouvellement` = 'EN_ATTENTE'
   AND `dateEnAttente` IS NULL;

COMMIT;
