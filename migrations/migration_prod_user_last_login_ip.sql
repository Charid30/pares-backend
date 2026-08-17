ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `last_login_ip` VARCHAR(45) NULL DEFAULT NULL
  COMMENT 'Adresse IP de la derniere connexion reussie',
  ADD COLUMN IF NOT EXISTS `last_login_at` DATETIME NULL DEFAULT NULL;

SELECT 'Migration user last_login_ip terminee' AS resultat;
