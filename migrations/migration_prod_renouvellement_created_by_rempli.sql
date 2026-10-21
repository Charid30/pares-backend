-- =============================================================================
-- Migration : auteur des demandes de renouvellement (renouvellement_stage.createdBy)
--
-- Une demande de renouvellement est toujours déposée par le candidat (« Mes stages » →
-- Renouveler ; candidat.service.demanderRenouvellement écrit createdBy = 'Candidat'). Les demandes
-- déposées avant cette écriture sont restées sans auteur (16 sur 18 sur la copie de production du
-- 2026-10-20) : le bloc « Soumis par » du détail restait vide.
--
-- Idempotent : ne touche que les lignes encore sans auteur. Les demandes restaurées par migration
-- (createdBy = 'Migration renouvellements orphelins') ne sont pas modifiées.
--
-- Vérification APRÈS (doit renvoyer 0) :
--   SELECT COUNT(*) FROM renouvellement_stage WHERE createdBy IS NULL;
-- Retour arrière :
--   UPDATE renouvellement_stage SET createdBy = NULL WHERE createdBy = 'Candidat'
--     AND createdDate < '2026-10-22';
-- =============================================================================

START TRANSACTION;

UPDATE `renouvellement_stage`
   SET `createdBy` = 'Candidat'
 WHERE `createdBy` IS NULL;

COMMIT;
