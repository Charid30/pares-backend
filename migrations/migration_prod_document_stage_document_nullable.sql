-- =============================================================================
-- Migration : document_stage.document facultatif
--
-- Problème : les PDF sont stockés sur disque (document_path) et le code écrit document = NULL
-- (createDocumentStage, remplacerConventionStage). En production la colonne est NOT NULL :
-- l'INSERT est refusé (« Column 'document' cannot be null ») → aucune convention jointe à
-- l'acceptation d'un renouvellement, aucune attestation. Le BLOB n'est plus qu'un repli pour
-- les anciens fichiers (fileStorage.readFile(path, blob)) : il doit pouvoir être NULL.
--
-- Sans perte de données (MODIFY ne change que la contrainte). Idempotent : relancer redéfinit
-- la même colonne.
--
-- Vérification (Null doit valoir YES après) :
--   SHOW COLUMNS FROM document_stage LIKE 'document';
-- Retour arrière (seulement si aucune ligne n'a document NULL) :
--   ALTER TABLE document_stage MODIFY COLUMN `document` MEDIUMBLOB NOT NULL;
-- =============================================================================

ALTER TABLE `document_stage`
  MODIFY COLUMN `document` MEDIUMBLOB NULL DEFAULT NULL;
