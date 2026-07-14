-- ============================================================
-- Migration PROD : date de début proposée par l'agent lors de l'approbation
-- Date : 2026-07-13
-- Idempotent : ADD COLUMN IF NOT EXISTS supporté par MariaDB 10+
-- Usage : mysql -u <user> -p pares_db < migration_prod_date_proposee.sql
-- ============================================================

ALTER TABLE `stage`
  ADD COLUMN IF NOT EXISTS `dateDebutProposee` DATE NULL DEFAULT NULL
  COMMENT 'Date de début proposée par l''agent lors de l''approbation (1er ou 15 du mois uniquement)';

SELECT 'Migration date proposée terminée' AS resultat;
