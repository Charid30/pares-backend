-- ============================================================
-- Migration PROD : date/heure d'audience confirmée par l'agent lors de l'acceptation
-- Date : 2026-08-14
-- Idempotent : ADD COLUMN IF NOT EXISTS supporté par MariaDB 10+
-- Usage : mysql -u <user> -p pares_db < migration_prod_audience_date_confirmee.sql
-- ============================================================

ALTER TABLE `demande_audience`
  ADD COLUMN IF NOT EXISTS `dateAudienceConfirmee` DATE NULL DEFAULT NULL
  COMMENT 'Date fixée par l''agent lors de l''acceptation (peut différer de la date souhaitée)',
  ADD COLUMN IF NOT EXISTS `heureAudienceConfirmee` TIME NULL DEFAULT NULL
  COMMENT 'Heure fixée par l''agent lors de l''acceptation';

SELECT 'Migration audience date confirmée terminée' AS resultat;
