-- ============================================================
-- MIGRATION PRODUCTION - PARES
-- Périmètre : Table offres uniquement
-- Date      : 2026-07-02
-- ============================================================

-- Colonne direction_iddirection : permet d'affecter/transférer
-- une offre commerciale vers une direction spécifique
ALTER TABLE `offres`
  ADD COLUMN IF NOT EXISTS `direction_iddirection` INT(11) NULL DEFAULT NULL
  COMMENT 'Direction responsable du traitement de cette offre';

-- Index pour les filtres par direction
-- (ignoré si l'index existe déjà)
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'offres'
    AND INDEX_NAME = 'idx_offres_direction'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `offres` ADD INDEX `idx_offres_direction` (`direction_iddirection`)',
  'SELECT ''Index idx_offres_direction déjà présent'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Contrainte FK : garantit qu'on ne peut pas affecter une direction inexistante
-- (ignorée si la contrainte existe déjà)
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'offres'
    AND CONSTRAINT_NAME = 'fk_offres_direction'
);
SET @sql2 = IF(@fk_exists = 0,
  'ALTER TABLE `offres` ADD CONSTRAINT `fk_offres_direction` FOREIGN KEY (`direction_iddirection`) REFERENCES `direction` (`iddirection`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''FK fk_offres_direction déjà présente'''
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Vérification :
--   SHOW COLUMNS FROM offres LIKE 'direction_iddirection';
--   SHOW INDEX FROM offres WHERE Key_name = 'idx_offres_direction';
--   SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
--     WHERE TABLE_NAME='offres' AND REFERENCED_TABLE_NAME='direction';
