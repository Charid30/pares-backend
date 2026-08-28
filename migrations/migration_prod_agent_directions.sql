-- Migration : table de jointure agents ↔ directions (plusieurs directions par agent)
-- Idempotente — safe à relancer

CREATE TABLE IF NOT EXISTS `agents_directions` (
  `id`                   INT NOT NULL AUTO_INCREMENT,
  `agent_idagents`       INT NOT NULL,
  `direction_iddirection` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_agent_direction`    (`agent_idagents`, `direction_iddirection`),
  INDEX        `idx_ad_agent`         (`agent_idagents`),
  INDEX        `idx_ad_direction`     (`direction_iddirection`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrer les affectations directes existantes (agents.direction_iddirection → junction)
INSERT IGNORE INTO `agents_directions` (`agent_idagents`, `direction_iddirection`)
SELECT `idagents`, `direction_iddirection`
FROM   `agents`
WHERE  `direction_iddirection` IS NOT NULL
  AND  `del` = 0;
