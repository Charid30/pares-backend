-- Migration : ajout de la colonne resoumis sur renouvellement_stage
-- Marque les renouvellements re-soumis après rejet ; seul l'admin peut les traiter.

ALTER TABLE renouvellement_stage
  ADD COLUMN resoumis TINYINT NOT NULL DEFAULT 0
    COMMENT '1 si ce renouvellement a été re-soumis après un rejet — traitement réservé à l\'admin';
