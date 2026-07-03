-- Migration : ajout du flag "lecture globale" (sous-admin) sur la table role
-- À exécuter une seule fois sur la base de production (pares_db).

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'role'
    AND COLUMN_NAME = 'lectureGlobale'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE role ADD COLUMN lectureGlobale TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "lectureGlobale existe déjà, rien à faire" AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
