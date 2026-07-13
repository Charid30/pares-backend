-- ============================================================
-- Migration PROD : élargir api_keys.keyPrefix (nouveau préfixe portail_snbh_)
-- Date : 2026-07-05
-- À exécuter seulement si la table api_keys existe déjà avec keyPrefix VARCHAR(20).
-- Idempotent : MODIFY COLUMN peut être rejoué sans erreur.
-- ============================================================

ALTER TABLE `api_keys`
  MODIFY COLUMN `keyPrefix` VARCHAR(30) NOT NULL;

SELECT 'Migration api_keys keyPrefix v2 terminée' AS resultat;
