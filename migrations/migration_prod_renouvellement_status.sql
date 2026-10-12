-- =============================================================================
-- Migration : extension de l'ENUM statusRenouvellement
-- Ajoute : EN_COURS, EXPIRE, TERMINE, RAPPORT_SOUMIS
-- Ajoute : colonne historiqueJson pour l'audit trail
-- =============================================================================
-- SÉCURITÉ :
--   - MODIFY COLUMN ENUM ajoute des valeurs en fin de liste → AUCUNE donnée perdue
--   - ALTER TABLE ... ADD COLUMN ajoute une colonne nullable → AUCUNE donnée affectée
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

-- Étape 2 : ajouter la colonne audit trail (nullable, aucun impact sur l'existant)
ALTER TABLE `renouvellement_stage`
  ADD COLUMN IF NOT EXISTS `historiqueJson` TEXT NULL
    COMMENT 'JSON array [{date, statut, auteur, note}] — journal des changements de statut';

-- Vérification finale : lister les valeurs de l'ENUM
-- SELECT COLUMN_TYPE FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE()
--     AND TABLE_NAME   = 'renouvellement_stage'
--     AND COLUMN_NAME  = 'statusRenouvellement';
