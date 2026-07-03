-- Migration : permettre de signaler les documents non conformes lors du rejet d'une demande de stage
-- (le candidat pourra ensuite remplacer uniquement ces documents au lieu de tout resoumettre).
-- À exécuter une seule fois sur la base de production (pares_db).

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stage'
    AND COLUMN_NAME = 'documentsRejetes'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE stage ADD COLUMN documentsRejetes TEXT NULL AFTER motifRefus',
  'SELECT "documentsRejetes existe déjà, rien à faire" AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
