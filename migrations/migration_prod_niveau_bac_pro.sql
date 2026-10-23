-- ============================================================
-- Migration PROD : ajout du niveau BAC PRO (stage de soutenance, avant Licence)
-- Date : 2026-10-23
-- Idempotent : MODIFY COLUMN peut être rejoué ; les valeurs existantes sont conservées.
-- Vérification : SHOW COLUMNS FROM stage LIKE 'niveau';
-- Retour arrière (seulement si aucun stage n'a le niveau BAC_PRO) :
--   ALTER TABLE `stage` MODIFY COLUMN `niveau` ENUM('CAP','BEPC','BEP','BAC','LICENCE','MASTER','DOCTORAT') NULL;
-- ============================================================

ALTER TABLE `stage`
  MODIFY COLUMN `niveau` ENUM('CAP','BEPC','BEP','BAC','BAC_PRO','LICENCE','MASTER','DOCTORAT') NULL;
