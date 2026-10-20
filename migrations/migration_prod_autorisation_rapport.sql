-- =============================================================================
-- Migration : autorisation de soumission anticipée du rapport de stage
-- Le rapport (un seul par chaîne stage + renouvellements) ne peut être soumis qu'après
-- la fin du dernier stage de la chaîne, sauf autorisation accordée par l'administration
-- (même principe que autorisation_renouvellement_stage). Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `autorisation_rapport_stage` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `stage_idstage`    INT          NOT NULL COMMENT 'Stage racine de la chaîne',
  `autorisePar`      INT          NULL     COMMENT 'Agent ayant accordé l''autorisation',
  `expiresAt`        DATETIME     NOT NULL,
  `usedAt`           DATETIME     NULL DEFAULT NULL,
  `del`              TINYINT      NOT NULL DEFAULT 0,
  `createdDate`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastmodifiedDate` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_autorisation_rapport_stage` (`stage_idstage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
