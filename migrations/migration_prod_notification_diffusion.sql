-- =============================================================================
-- Migration : notifications diffusées par l'admin (push + cloche) — 2026-11-07
--
-- notification_diffusion : historique des messages envoyés volontairement par un administrateur
--   aux candidats, aux agents (tous ou ceux de certaines directions) ou à tout le monde.
--   Chaque envoi crée aussi une notification « cloche » par destinataire (table notifications,
--   type ANNONCE) et un push sur les appareils abonnés.
-- Aucune donnée existante modifiée.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS).
-- Vérification : SELECT * FROM notification_diffusion ORDER BY id DESC;
-- Retour arrière : DROP TABLE notification_diffusion; (aucune autre table n'en dépend ; les notifications
--   « cloche » déjà créées restent : DELETE FROM notifications WHERE type = 'ANNONCE'; pour les retirer)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `notification_diffusion` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `titre`            VARCHAR(100) NOT NULL,
  `message`          VARCHAR(500) NOT NULL,
  `cible`            VARCHAR(20)  NOT NULL COMMENT 'CANDIDATS | AGENTS | TOUS',
  `directions`       VARCHAR(500) NULL     COMMENT 'Agents : ids des directions ciblées (JSON), NULL = toutes',
  `nbDestinataires`  INT          NOT NULL DEFAULT 0 COMMENT 'Notifications cloche créées',
  `nbAppareils`      INT          NOT NULL DEFAULT 0 COMMENT 'Appareils abonnés au push au moment de l''envoi',
  `nbPushReussis`    INT          NULL     COMMENT 'Rempli à la fin de l''envoi des push (en arrière-plan)',
  `nbPushEchecs`     INT          NULL,
  `envoyeParId`      INT          NULL     COMMENT 'agents.idagents de l''admin, si son compte a un profil agent',
  `envoyePar`        VARCHAR(255) NOT NULL,
  `createdDate`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification_diffusion_date` (`createdDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Notifications push envoyées volontairement par l''admin';
