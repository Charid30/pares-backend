ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `failedLoginAttempts` INT NOT NULL DEFAULT 0
  COMMENT 'Tentatives de connexion echouees consecutives',
  ADD COLUMN IF NOT EXISTS `lockedUntil` DATETIME NULL DEFAULT NULL
  COMMENT 'Verrouillage temporaire du compte apres trop d echecs';

SELECT 'Migration user lockout terminee' AS resultat;
