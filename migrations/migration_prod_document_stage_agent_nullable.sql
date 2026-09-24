-- Migration : rendre agents_idagents nullable dans document_stage
-- Permet aux admins (sans enregistrement agent) de créer des documents (conventions, attestations)

ALTER TABLE `document_stage`
  MODIFY COLUMN `agents_idagents` INT NULL;
