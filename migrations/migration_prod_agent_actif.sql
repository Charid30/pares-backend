-- ============================================================
-- Migration PROD : désactivation temporaire d'un compte agent
-- Date : 2026-07-30
-- Idempotent : ADD COLUMN IF NOT EXISTS supporté par MariaDB 10+
-- Usage : mysql -u <user> -p pares_db < migration_prod_agent_actif.sql
-- ============================================================

ALTER TABLE `agents`
  ADD COLUMN IF NOT EXISTS `actif` TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Compte désactivé temporairement par un admin (distinct de la suppression) — bloque la connexion';

SELECT 'Migration agent actif terminée' AS resultat;
