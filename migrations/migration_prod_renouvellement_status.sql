-- =============================================================================
-- Migration : extension de l'ENUM statusRenouvellement + champs d'audit
-- Ajoute les statuts : EN_COURS, EXPIRE, TERMINE, RAPPORT_SOUMIS
-- Ajoute les champs d'audit : createdBy, lastModifiedDate, lastModifiedBy,
--                             deletedDate, deletedBy
-- =============================================================================
-- SÉCURITÉ :
--   - MODIFY COLUMN ENUM ajoute des valeurs en fin de liste → AUCUNE donnée perdue
--   - ADD COLUMN IF NOT EXISTS ajoute des colonnes nullables → AUCUNE donnée affectée
--   - MySQL reconstruira la table (bref verrou), sur une petite table c'est quasi-instantané
-- =============================================================================

-- Étape 1 : étendre l'ENUM (toutes les valeurs existantes sont préservées)
ALTER TABLE `renouvellement_stage`
  MODIFY COLUMN `statusRenouvellement`
    ENUM(
      'EN_ATTENTE',
      'PROGRAMMATION_EN_COURS',
      'ACCEPTE',
      'REJETE',
      'EN_COURS',
      'EXPIRE',
      'TERMINE',
      'RAPPORT_SOUMIS'
    )
    NOT NULL DEFAULT 'EN_ATTENTE';

-- Étape 2 : ajouter les champs d'audit (nullable, aucun impact sur l'existant)
ALTER TABLE `renouvellement_stage`
  ADD COLUMN IF NOT EXISTS `createdBy`        VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `lastModifiedDate` DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS `lastModifiedBy`   VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `deletedDate`      DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS `deletedBy`        VARCHAR(255) NULL;

-- Vérification finale : structure de la table
-- DESCRIBE renouvellement_stage;
