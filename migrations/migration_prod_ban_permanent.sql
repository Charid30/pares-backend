-- ============================================================
-- Migration PROD : bannissement permanent (à vie) d'une IP
-- Date : 2026-07-15
-- Idempotent : ADD COLUMN IF NOT EXISTS supporté par MariaDB 10+
-- Usage : mysql -u <user> -p pares_db < migration_prod_ban_permanent.sql
-- ============================================================

ALTER TABLE `banned_ips`
  ADD COLUMN IF NOT EXISTS `permanent` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Bannissement définitif décidé manuellement par un administrateur';

SELECT 'Migration ban permanent terminée' AS resultat;
