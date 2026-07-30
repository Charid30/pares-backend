-- ============================================================
-- Migration PROD : notifications push navigateur (Web Push API)
-- Date : 2026-07-14
-- Idempotent : peut être exécutée plusieurs fois sans erreur.
-- Usage : mysql -u <user> -p pares_db < migration_prod_push_subscriptions.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`             INT(11)      NOT NULL AUTO_INCREMENT,
  `recipient_type` ENUM('AGENT','CANDIDAT') NOT NULL,
  `recipient_id`   INT(11)      NOT NULL,
  `endpoint`       VARCHAR(500) NOT NULL,
  `p256dh`         VARCHAR(255) NOT NULL,
  `auth`           VARCHAR(255) NOT NULL,
  `userAgent`      VARCHAR(255) NULL DEFAULT NULL,
  `createdAt`      DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_endpoint_unique` (`endpoint`(255)),
  KEY `push_subscriptions_recipient` (`recipient_type`, `recipient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration push_subscriptions terminée' AS resultat;
