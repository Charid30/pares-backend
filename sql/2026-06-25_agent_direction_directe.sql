-- Migration : permettre de rattacher un agent directement à une Direction
-- (sans passer par un Service), pour les agents qui n'appartiennent à aucun service.
-- À exécuter une seule fois sur la base de production (pares_db).

-- 1. service_idservice devient nullable (un agent peut maintenant n'avoir aucun service)
ALTER TABLE agents MODIFY COLUMN service_idservice INT(11) NULL;

-- 2. Ajout de la colonne direction_iddirection (rattachement direct, idempotent)
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agents'
    AND COLUMN_NAME = 'direction_iddirection'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE agents ADD COLUMN direction_iddirection INT(11) NULL AFTER service_idservice',
  'SELECT "direction_iddirection existe déjà, rien à faire" AS info'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Contrainte de clé étrangère vers direction (idempotent)
SET @fk_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agents'
    AND CONSTRAINT_NAME = 'fk_agents_direction'
);

SET @fk_ddl := IF(
  @fk_exists = 0,
  'ALTER TABLE agents ADD CONSTRAINT fk_agents_direction FOREIGN KEY (direction_iddirection) REFERENCES direction(iddirection)',
  'SELECT "fk_agents_direction existe déjà, rien à faire" AS info'
);

PREPARE stmt2 FROM @fk_ddl;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
