-- Migration : ajout des champs date/heure de traitement sur la table aides
ALTER TABLE `aides`
  ADD COLUMN IF NOT EXISTS `dateTraitement`  DATE        NULL DEFAULT NULL
    COMMENT 'Date du rendez-vous de traitement fixée par l''administration',
  ADD COLUMN IF NOT EXISTS `heureTraitement` TIME        NULL DEFAULT NULL
    COMMENT 'Heure du rendez-vous de traitement';

SELECT 'Migration aide_date_traitement terminee' AS resultat;
