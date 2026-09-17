-- Migration : ajout du statut EN_COURS_DE_TRAITEMENT pour le workflow d'approbation des renouvellements
-- Les agents approuvent (EN_COURS_DE_TRAITEMENT), les admins valident (ACCEPTE/REJETE)

ALTER TABLE renouvellement_stage
  MODIFY COLUMN statusRenouvellement
    ENUM('EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'ACCEPTE', 'REJETE')
    NOT NULL
    DEFAULT 'EN_ATTENTE';
