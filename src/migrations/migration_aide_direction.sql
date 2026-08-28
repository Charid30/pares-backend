-- Migration : ajout des champs de direction et traçabilité du transfert
-- sur la table aides

ALTER TABLE `aides`
  ADD COLUMN IF NOT EXISTS `direction_iddirection` INT          NULL DEFAULT NULL
    COMMENT 'Direction SONABHY à laquelle l\'aide est affectée',
  ADD COLUMN IF NOT EXISTS `transfereParId`         INT          NULL DEFAULT NULL
    COMMENT 'ID de l\'agent ayant transféré l\'aide',
  ADD COLUMN IF NOT EXISTS `transferePar`           VARCHAR(150) NULL DEFAULT NULL
    COMMENT 'Nom de l\'agent ayant transféré l\'aide (snapshot)',
  ADD COLUMN IF NOT EXISTS `transfereDate`          DATETIME     NULL DEFAULT NULL
    COMMENT 'Date du dernier transfert de direction';

SELECT 'Migration aide_direction terminee' AS resultat;
