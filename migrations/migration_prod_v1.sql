-- ============================================================
-- MIGRATION PRODUCTION - PARES
-- Version : v1
-- Date    : 2026-07-02
-- Auteur  : Généré automatiquement
--
-- CE SCRIPT EST IDEMPOTENT : safe à re-exécuter plusieurs fois.
-- Chaque ALTER est protégé par un IF NOT EXISTS.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLE role — ajout colonne lectureGlobale
--    Permet à un rôle d'avoir accès en lecture à toutes les
--    directions (bypass du filtre direction sur consultation)
-- ────────────────────────────────────────────────────────────
ALTER TABLE `role`
  ADD COLUMN IF NOT EXISTS `lectureGlobale` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Si 1, le rôle voit toutes les données sans filtre par direction';


-- ────────────────────────────────────────────────────────────
-- 2. TABLE offres — ajout colonne direction_iddirection
--    Permet d'affecter/transférer une offre commerciale vers
--    une direction spécifique
-- ────────────────────────────────────────────────────────────
ALTER TABLE `offres`
  ADD COLUMN IF NOT EXISTS `direction_iddirection` INT(11) NULL DEFAULT NULL
  COMMENT 'Direction responsable du traitement de cette offre';

-- Index pour les recherches filtrées par direction
ALTER TABLE `offres`
  ADD INDEX IF NOT EXISTS `idx_offres_direction` (`direction_iddirection`);


-- ────────────────────────────────────────────────────────────
-- 3. TABLE demande_audience — ajout colonne direction_iddirection
--    Permet d'affecter/transférer une demande d'audience vers
--    une direction spécifique
-- ────────────────────────────────────────────────────────────
ALTER TABLE `demande_audience`
  ADD COLUMN IF NOT EXISTS `direction_iddirection` INT(11) NULL DEFAULT NULL
  COMMENT 'Direction responsable du traitement de cette demande d\'audience';

-- Index pour les recherches filtrées par direction
ALTER TABLE `demande_audience`
  ADD INDEX IF NOT EXISTS `idx_audience_direction` (`direction_iddirection`);


-- ────────────────────────────────────────────────────────────
-- 4. TABLE app_settings — paramètres globaux de la plateforme
--    Stocke la configuration SMTP, notifications, routage, etc.
--    en JSON dans une seule ligne (singleton)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id`        INT(11)      NOT NULL AUTO_INCREMENT,
  `settings`  LONGTEXT     CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL
              CHECK (json_valid(`settings`)),
  `updatedBy` VARCHAR(100) DEFAULT NULL,
  `createdAt` DATETIME     NOT NULL DEFAULT current_timestamp(),
  `updatedAt` DATETIME     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Paramètres globaux de la plateforme PARES (SMTP, notifications, routage, etc.)';


-- ────────────────────────────────────────────────────────────
-- 5. TABLE agent_notification_prefs — préférences notifications
--    Stocke les préférences d'email par agent et par type
--    (STAGE, OFFRE, AIDE, AUDIENCE, RECRUTEMENT)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `agent_notification_prefs` (
  `id`               INT(11) NOT NULL AUTO_INCREMENT,
  `agent_idagents`   INT(11) NOT NULL,
  `notificationType` ENUM('STAGE','RECRUTEMENT','OFFRE','AIDE','AUDIENCE') NOT NULL,
  `enabled`          TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_agent_type` (`agent_idagents`, `notificationType`),
  KEY `idx_agent` (`agent_idagents`),
  CONSTRAINT `fk_notif_prefs_agent`
    FOREIGN KEY (`agent_idagents`) REFERENCES `agents` (`idagents`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Préférences de notification email des agents';


-- ============================================================
-- FIN DU SCRIPT
-- Pour vérifier l'application :
--   SHOW COLUMNS FROM role LIKE 'lectureGlobale';
--   SHOW COLUMNS FROM offres LIKE 'direction_iddirection';
--   SHOW COLUMNS FROM demande_audience LIKE 'direction_iddirection';
--   SHOW TABLES LIKE 'app_settings';
--   SHOW TABLES LIKE 'agent_notification_prefs';
-- ============================================================
