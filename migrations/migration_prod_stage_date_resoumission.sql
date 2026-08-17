ALTER TABLE `stage`
  ADD COLUMN IF NOT EXISTS `dateResoumission` DATETIME NULL DEFAULT NULL
  COMMENT 'Date à laquelle le candidat a resoumis la demande après un rejet';

SELECT 'Migration stage date resoumission terminee' AS resultat;
