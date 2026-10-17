-- =============================================================================
-- Migration : ajout du statut EN_COURS_DE_TRAITEMENT sur renouvellement_stage
-- Aligne le circuit du renouvellement sur celui de la demande de stage
-- (bouton « Traiter » de l'administration : EN_ATTENTE → EN_COURS_DE_TRAITEMENT).
-- =============================================================================
-- SÉCURITÉ : MODIFY COLUMN ENUM ajoute une valeur en fin de liste → AUCUNE donnée perdue.
-- Idempotent : relancer la migration redéfinit le même ENUM.
-- =============================================================================

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
      'RAPPORT_SOUMIS',
      'EN_COURS_DE_TRAITEMENT'
    )
    NOT NULL DEFAULT 'EN_ATTENTE';
