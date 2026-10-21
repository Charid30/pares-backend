-- =============================================================================
-- Migration : date de création des renouvellements (renouvellement_stage.createdDate)
--
-- La colonne a été ajoutée sans valeur par défaut (migration_prod_renouvellement_created_date.sql)
-- et retirée du modèle Sequelize le 2026-10-12 : elle est restée NULL pour toutes les demandes
-- (16 sur 18 sur la copie de production du 2026-10-20).
--   1. remplissage avec la date de la demande (dateRenouvellement, renseignée pour toutes) ;
--   2. valeur par défaut CURRENT_TIMESTAMP et NOT NULL : chaque nouvelle demande est datée
--      automatiquement (le modèle la renseigne aussi).
--
-- Idempotent : le remplissage ne touche que les lignes encore NULL ; MODIFY redéfinit la même colonne.
-- Vérification APRÈS (doit renvoyer 0) :
--   SELECT COUNT(*) FROM renouvellement_stage WHERE createdDate IS NULL;
-- Retour arrière (structure) :
--   ALTER TABLE renouvellement_stage MODIFY COLUMN createdDate DATETIME NULL DEFAULT NULL;
-- =============================================================================

UPDATE `renouvellement_stage`
   SET `createdDate` = `dateRenouvellement`
 WHERE `createdDate` IS NULL;

ALTER TABLE `renouvellement_stage`
  MODIFY COLUMN `createdDate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
