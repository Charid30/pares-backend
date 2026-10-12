-- Migration : ajout de createdDate sur renouvellement_stage
-- Colonne manquante dans la migration précédente (migration_prod_renouvellement_status.sql)
ALTER TABLE `renouvellement_stage`
  ADD COLUMN IF NOT EXISTS `createdDate` DATETIME NULL;
