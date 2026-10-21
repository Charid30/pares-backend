-- =============================================================================
-- Migration : stages ayant une convention mais restés « avant décision »
--
-- Règle : un stage est validé dès que sa convention est jointe → ACCEPTE si la date de début
-- n'est pas arrivée, EN_COURS si elle l'est, EXPIRE si la date de fin est dépassée (même règle
-- que stageStatusJob : fin strictement < aujourd'hui).
-- Constaté sur la copie de production du 2026-10-20 : stage 219 (renouvellement n°1, ZANGO
-- Dieudonné), accepté avec convention le 09/07 (période 01/07 → 31/08), puis refusé « Doublon »
-- et rouvert → revenu EN_ATTENTE avec sa convention.
--
-- Le renouvellement prend directement le même statut final (pas d'étape ACCEPTE / EN_COURS
-- intermédiaire : le job enverrait sinon au candidat un e-mail « renouvellement expiré »).
-- Idempotent : ne touche que les lignes encore « avant décision ».
--
-- Vérification AVANT / APRÈS (doit renvoyer 0 ligne après) :
--   SELECT s.idstage, s.statusStage, s.dateDebutEffective, s.dateFinEffective FROM stage s
--   WHERE s.del = 0 AND s.statusStage IN ('EN_ATTENTE','EN_COURS_DE_TRAITEMENT','PROGRAMMATION_EN_COURS')
--     AND s.dateDebutEffective IS NOT NULL AND s.dateFinEffective IS NOT NULL
--     AND EXISTS (SELECT 1 FROM document_stage d WHERE d.stage_idstage = s.idstage
--                 AND d.typeDocument = 'CONVENTION' AND d.del = 0);
--
-- Retour arrière (cas constaté) :
--   UPDATE stage SET statusStage = 'EN_ATTENTE' WHERE idstage = 219;
--   UPDATE renouvellement_stage SET statusRenouvellement = 'EN_ATTENTE' WHERE stage_nouveau_idstage = 219;
-- =============================================================================

START TRANSACTION;

-- 1. Statut du stage d'après ses dates
UPDATE stage s
   SET s.statusStage = CASE
         WHEN s.dateFinEffective < CURDATE()    THEN 'EXPIRE'
         WHEN s.dateDebutEffective <= CURDATE() THEN 'EN_COURS'
         ELSE 'ACCEPTE'
       END
 WHERE s.del = 0
   AND s.statusStage IN ('EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS')
   AND s.dateDebutEffective IS NOT NULL
   AND s.dateFinEffective IS NOT NULL
   AND EXISTS (SELECT 1 FROM document_stage d
                WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

-- 2. Renouvellement encore « avant décision » alors que son stage est validé : même statut
UPDATE renouvellement_stage r
  JOIN stage s ON s.idstage = r.stage_nouveau_idstage
   SET r.statusRenouvellement = s.statusStage,
       r.lastModifiedBy       = 'Migration stages convention en attente',
       r.lastModifiedDate     = NOW()
 WHERE r.del = 0
   AND r.statusRenouvellement IN ('EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS')
   AND s.statusStage IN ('ACCEPTE', 'EN_COURS', 'EXPIRE')
   AND EXISTS (SELECT 1 FROM document_stage d
                WHERE d.stage_idstage = s.idstage AND d.typeDocument = 'CONVENTION' AND d.del = 0);

COMMIT;
