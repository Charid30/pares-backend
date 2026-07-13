-- ============================================================
-- Migration PROD : table api_keys (communication applications externes)
-- Date : 2026-07-05
-- Idempotent : peut être exécutée plusieurs fois sans erreur.
-- Usage : mysql -u <user> -p pares_db < migration_prod_api_keys.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `api_keys` (
  `idapikey`        INT(11)      NOT NULL AUTO_INCREMENT,
  `nomApplication`  VARCHAR(150) NOT NULL,
  `description`     VARCHAR(500) NULL DEFAULT NULL,
  `keyHash`         VARCHAR(64)  NOT NULL,
  `keyPrefix`       VARCHAR(30)  NOT NULL,
  `scope`           ENUM('LECTURE','ECRITURE','LECTURE_ECRITURE') NOT NULL DEFAULT 'LECTURE',
  `actif`           TINYINT(1)   NOT NULL DEFAULT 1,
  `expiresAt`       DATETIME     NULL DEFAULT NULL,
  `lastUsedAt`      DATETIME     NULL DEFAULT NULL,
  `createdBy`       VARCHAR(150) NULL DEFAULT NULL,
  `del`             TINYINT(4)   NOT NULL DEFAULT 0,
  `createdAt`       DATETIME     NOT NULL,
  `updatedAt`       DATETIME     NOT NULL,
  PRIMARY KEY (`idapikey`),
  UNIQUE KEY `api_keys_keyHash_unique` (`keyHash`),
  KEY `api_keys_key_hash` (`keyHash`),
  KEY `api_keys_actif` (`actif`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration api_keys terminée' AS resultat;
