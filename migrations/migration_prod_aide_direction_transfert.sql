-- ============================================================
-- Migration PROD : direction + traçabilité transfert sur aides
-- Date : 2026-08-28
-- Idempotent : ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE `aides`
  ADD COLUMN IF NOT EXISTS `direction_iddirection` INT          NULL DEFAULT NULL
    COMMENT 'Direction SONABHY à laquelle l''aide est affectée',
  ADD COLUMN IF NOT EXISTS `transfereParId`         INT          NULL DEFAULT NULL
    COMMENT 'ID de l''agent ayant transféré l''aide',
  ADD COLUMN IF NOT EXISTS `transferePar`           VARCHAR(150) NULL DEFAULT NULL
    COMMENT 'Nom de l''agent ayant transféré l''aide (snapshot)',
  ADD COLUMN IF NOT EXISTS `transfereDate`          DATETIME     NULL DEFAULT NULL
    COMMENT 'Date du dernier transfert de direction';

SELECT 'Migration aide_direction_transfert terminée' AS resultat;
