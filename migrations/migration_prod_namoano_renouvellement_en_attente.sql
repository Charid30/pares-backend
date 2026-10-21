-- =============================================================================
-- Migration : renouvellement n°8 (NAMOANO Aristide Arzouma) remis « En attente »
--
-- Ce renouvellement a été accepté le 17/09 sans convention (ancien écran), puis activé
-- EN_COURS par l'ancien job (stage 516, 15/09 → 14/11). Décision de l'administration
-- (2026-10-21) : le dossier repart du début du circuit — EN_ATTENTE, comme le stage 516.
-- Les dates du stage 516 sont conservées (elles servent de proposition).
--
-- Idempotent : ne touche le dossier que tant qu'il n'a toujours pas de convention et qu'il est
-- encore au statut posé par la migration précédente (ACCEPTE) ou par l'ancien job (EN_COURS).
--
-- Vérification AVANT / APRÈS :
--   SELECT r.idrenouvellement, r.statusRenouvellement, s.statusStage FROM renouvellement_stage r
--   JOIN stage s ON s.idstage = r.stage_nouveau_idstage WHERE s.idstage = 516;
--
-- Retour arrière :
--   UPDATE stage SET statusStage = 'ACCEPTE' WHERE idstage = 516;
--   UPDATE renouvellement_stage SET statusRenouvellement = 'ACCEPTE' WHERE stage_nouveau_idstage = 516;
-- =============================================================================

START TRANSACTION;

UPDATE renouvellement_stage r
  JOIN stage s ON s.idstage = r.stage_nouveau_idstage
   SET r.statusRenouvellement = 'EN_ATTENTE',
       r.lastModifiedBy       = 'Migration NAMOANO en attente',
       r.lastModifiedDate     = NOW()
 WHERE s.idstage = 516
   AND r.del = 0
   AND r.statusRenouvellement IN ('ACCEPTE', 'EN_COURS')
   AND NOT EXISTS (SELECT 1 FROM document_stage d
                    WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

UPDATE stage s
   SET s.statusStage = 'EN_ATTENTE'
 WHERE s.idstage = 516
   AND s.del = 0
   AND s.statusStage IN ('ACCEPTE', 'EN_COURS')
   AND NOT EXISTS (SELECT 1 FROM document_stage d
                    WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

COMMIT;
