-- ============================================================
-- Migration PROD : date/heure d'entretien sur les offres
-- Date : 2026-08-28
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE `offres`
  ADD COLUMN IF NOT EXISTS `dateEntretien`  DATE NULL DEFAULT NULL
    COMMENT 'Date du rendez-vous d''entretien fixée lors de la validation',
  ADD COLUMN IF NOT EXISTS `heureEntretien` TIME NULL DEFAULT NULL
    COMMENT 'Heure du rendez-vous d''entretien';

SELECT 'Migration offre_date_entretien terminée' AS resultat;
