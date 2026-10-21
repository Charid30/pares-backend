-- =============================================================================
-- Migration : stages « En cours » sans convention → « Accepté » (en attente de la convention)
--
-- Règle : un stage n'est validé que lorsque sa convention est jointe ; le job n'active
-- (ACCEPTE → EN_COURS) que les stages ayant une convention. Avant le 2026-10-14, le job activait
-- aussi les stages sans convention, et l'ancien écran acceptait un renouvellement sans l'envoyer.
-- Constaté sur la copie de production du 2026-10-20 : stage 516 (renouvellement n°8, NAMOANO
-- Aristide Arzouma, 15/09 → 14/11), accepté le 17/09 et passé EN_COURS sans convention.
--
-- Après la migration, l'admin joint la convention (détail du renouvellement → « Joindre la
-- convention ») ; le job repasse alors le stage EN_COURS dans l'heure et le renouvellement suit.
-- Les stages déjà terminés (EXPIRE, TERMINE, RAPPORT_SOUMIS) ne sont pas touchés.
-- Idempotent : ne touche que les stages encore EN_COURS sans convention.
--
-- Vérification AVANT / APRÈS (doit renvoyer 0 ligne après) :
--   SELECT s.idstage, s.statusStage FROM stage s
--   WHERE s.del = 0 AND s.statusStage = 'EN_COURS'
--     AND NOT EXISTS (SELECT 1 FROM document_stage d WHERE d.stage_idstage = s.idstage
--                     AND d.typeDocument = 'CONVENTION' AND d.del = 0);
--
-- Retour arrière (cas constaté) :
--   UPDATE stage SET statusStage = 'EN_COURS' WHERE idstage = 516;
--   UPDATE renouvellement_stage SET statusRenouvellement = 'EN_COURS' WHERE stage_nouveau_idstage = 516;
-- =============================================================================

START TRANSACTION;

-- 1. Renouvellement en cours dont le stage n'a pas de convention → ACCEPTE (avant le stage,
--    pour pouvoir encore le repérer par le statut EN_COURS de son stage)
UPDATE renouvellement_stage r
  JOIN stage s ON s.idstage = r.stage_nouveau_idstage
   SET r.statusRenouvellement = 'ACCEPTE',
       r.lastModifiedBy       = 'Migration stages en cours sans convention',
       r.lastModifiedDate     = NOW()
 WHERE r.del = 0
   AND r.statusRenouvellement = 'EN_COURS'
   AND s.del = 0
   AND s.statusStage = 'EN_COURS'
   AND NOT EXISTS (SELECT 1 FROM document_stage d
                    WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

-- 2. Stage en cours sans convention → ACCEPTE
UPDATE stage s
   SET s.statusStage = 'ACCEPTE'
 WHERE s.del = 0
   AND s.statusStage = 'EN_COURS'
   AND NOT EXISTS (SELECT 1 FROM document_stage d
                    WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

COMMIT;
