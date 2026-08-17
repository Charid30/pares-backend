ALTER TABLE `candidats`
  ADD COLUMN IF NOT EXISTS `passeport` VARCHAR(12) NULL DEFAULT NULL
  COMMENT 'Numero de passeport - alternative au NIP pour identification a inscription';

ALTER TABLE `candidats`
  MODIFY COLUMN `nip` CHAR(17) NULL DEFAULT NULL
  COMMENT 'Numero NIP - 17 chiffres de la CNIB';

-- Index unique sur passeport (autorise plusieurs NULL, comme nip)
SET @idx_exists = (
  SELECT COUNT(1) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'candidats' AND INDEX_NAME = 'candidats_passeport_unique'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `candidats` ADD UNIQUE INDEX `candidats_passeport_unique` (`passeport`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration candidat passeport terminee' AS resultat;
