-- Migration : ajout des colonnes lettreNonConforme et conventionNonConforme
-- Permettent aux agents/admins de signaler les fichiers non conformes lors d'un rejet,
-- afin que le candidat puisse les corriger avant de ressoumettre.

ALTER TABLE renouvellement_stage
  ADD COLUMN lettreNonConforme TINYINT NOT NULL DEFAULT 0
    COMMENT '1 si la lettre de motivation est non conforme',
  ADD COLUMN conventionNonConforme TINYINT NOT NULL DEFAULT 0
    COMMENT '1 si la convention de stage est non conforme';
