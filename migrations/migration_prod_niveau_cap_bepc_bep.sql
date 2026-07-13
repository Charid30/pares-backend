-- ============================================================
-- Migration PROD : ajout des niveaux CAP/BEPC/BEP (avant BAC)
-- Date : 2026-07-13
-- Idempotent : peut être exécutée plusieurs fois sans erreur.
-- Usage : mysql -u <user> -p pares_db < migration_prod_niveau_cap_bepc_bep.sql
-- ============================================================

ALTER TABLE `stage`
  MODIFY COLUMN `niveau` ENUM('CAP','BEPC','BEP','BAC','LICENCE','MASTER','DOCTORAT') NULL;

SELECT 'Migration niveau CAP/BEPC/BEP terminée' AS resultat;
