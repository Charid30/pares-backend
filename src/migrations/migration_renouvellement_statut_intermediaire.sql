-- Migration : ajout du statut PROGRAMMATION_EN_COURS pour le workflow d'approbation des renouvellements
-- Les agents approuvent (PROGRAMMATION_EN_COURS), les admins valident (ACCEPTE/REJETE)
-- Cohérent avec le workflow des demandes de stage

ALTER TABLE renouvellement_stage
  MODIFY COLUMN statusRenouvellement
    ENUM('EN_ATTENTE', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'REJETE')
    NOT NULL
    DEFAULT 'EN_ATTENTE';
