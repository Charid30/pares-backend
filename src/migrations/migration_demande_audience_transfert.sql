-- Migration : ajout des champs de traçabilité du transfert de direction
-- sur la table demande_audience

ALTER TABLE `demande_audience`
  ADD COLUMN IF NOT EXISTS `transfereParId`  INT          NULL DEFAULT NULL
    COMMENT 'ID de l\'agent ayant transféré la demande',
  ADD COLUMN IF NOT EXISTS `transferePar`    VARCHAR(150) NULL DEFAULT NULL
    COMMENT 'Nom de l\'agent ayant transféré la demande (snapshot)',
  ADD COLUMN IF NOT EXISTS `transfereDate`   DATETIME     NULL DEFAULT NULL
    COMMENT 'Date du dernier transfert de direction';

SELECT 'Migration demande_audience_transfert terminee' AS resultat;
