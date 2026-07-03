-- Migration : conserver la durée de stage initialement demandée par le candidat,
-- distincte de dureeStage qui est désormais mise à jour avec la durée accordée
-- par l'agent/admin lors de l'acceptation (sinon la demande initiale serait perdue).
-- À exécuter une seule fois sur la base de production (pares_db).

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stage'
    AND COLUMN_NAME = 'dureeStageSouhaitee'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE stage ADD COLUMN dureeStageSouhaitee INT NULL AFTER dureeStage',
  'SELECT "dureeStageSouhaitee existe déjà, rien à faire" AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill : pour toutes les demandes existantes, dureeStage contient encore la durée
-- demandée par le candidat (la fonctionnalité d'écrasement par la durée accordée n'a
-- jamais été déployée avant cette migration) — on la recopie donc telle quelle.
UPDATE stage SET dureeStageSouhaitee = dureeStage WHERE dureeStageSouhaitee IS NULL;
