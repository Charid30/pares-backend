-- =============================================================================
-- Migration : restaurer les demandes de renouvellement « orphelines »
--
-- Problème : demanderRenouvellement (candidat.service.js) créait le stage enfant puis la ligne
-- renouvellement_stage sans transaction. Quand la 2e étape échouait, il restait un stage enfant
-- (stage_parent_idstage renseigné) sans renouvellement : invisible dans les écrans Renouvellements
-- (admin, agent) et bloquant le candidat (« une demande de renouvellement existe déjà »).
-- Constaté sur la copie de production du 2026-10-20 : stages 468 (NIGNAN, 29/08) et 571 (NEBIE, 07/10).
-- Le code est corrigé (transaction) ; cette migration répare les données existantes.
--
-- 1. Direction : un stage de renouvellement sans direction reprend celle de son stage parent
--    (règle : direction de la demande d'origine). Concerne aussi le stage 436 (renouvellement n°2).
-- 2. Documents : un stage orphelin sans un document reprend celui du parent (chemin disque).
--    Limité aux orphelins : les anciens renouvellements sans copie des chemins ne sont pas touchés.
-- 3. Renouvellement : création de la ligne manquante (EN_ATTENTE, durée = durée du stage enfant,
--    date = date de création du stage enfant). La lettre du candidat n'a jamais été enregistrée :
--    lettre vide ; l'admin peut refuser avec « lettre non conforme » pour que le candidat la renvoie.
--
-- Idempotent : chaque étape ne touche que les lignes encore incomplètes.
--
-- Vérification AVANT / APRÈS (doit renvoyer 0 ligne après) :
--   SELECT s.idstage, s.stage_parent_idstage, s.direction_iddirection FROM stage s
--   WHERE s.del = 0 AND s.stage_parent_idstage IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);
--
-- Retour arrière :
--   DELETE FROM renouvellement_stage WHERE createdBy = 'Migration renouvellements orphelins';
--   (les directions et chemins de documents recopiés peuvent rester : ils suivent la règle métier)
-- =============================================================================

START TRANSACTION;

-- 1. Direction / service reprises du stage parent
UPDATE stage s
  JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.direction_iddirection = p.direction_iddirection,
       s.service_idservice     = COALESCE(s.service_idservice, p.service_idservice)
 WHERE s.del = 0
   AND s.stage_parent_idstage IS NOT NULL
   AND s.direction_iddirection IS NULL
   AND p.direction_iddirection IS NOT NULL;

-- 2. Documents absents du stage orphelin, repris du parent (fichier sur disque) — avant l'étape 3
UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.cv_path = p.cv_path, s.cv_filename = p.cv_filename, s.cv_size = p.cv_size
 WHERE s.del = 0 AND s.cv IS NULL AND s.cv_path IS NULL AND p.cv_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.cnib_path = p.cnib_path, s.cnib_filename = p.cnib_filename, s.cnib_size = p.cnib_size
 WHERE s.del = 0 AND s.cnib IS NULL AND s.cnib_path IS NULL AND p.cnib_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.casierJudiciaire_path = p.casierJudiciaire_path, s.casierJudiciaire_filename = p.casierJudiciaire_filename,
       s.casierJudiciaire_size = p.casierJudiciaire_size
 WHERE s.del = 0 AND s.casierJudiciaire IS NULL AND s.casierJudiciaire_path IS NULL AND p.casierJudiciaire_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.lettreMotivation_path = p.lettreMotivation_path, s.lettreMotivation_filename = p.lettreMotivation_filename,
       s.lettreMotivation_size = p.lettreMotivation_size
 WHERE s.del = 0 AND s.lettreMotivation IS NULL AND s.lettreMotivation_path IS NULL AND p.lettreMotivation_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.lettreRecommandation_path = p.lettreRecommandation_path, s.lettreRecommandation_filename = p.lettreRecommandation_filename,
       s.lettreRecommandation_size = p.lettreRecommandation_size
 WHERE s.del = 0 AND s.lettreRecommandation IS NULL AND s.lettreRecommandation_path IS NULL AND p.lettreRecommandation_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

UPDATE stage s JOIN stage p ON p.idstage = s.stage_parent_idstage
   SET s.dernierDiplome_path = p.dernierDiplome_path, s.dernierDiplome_filename = p.dernierDiplome_filename,
       s.dernierDiplome_size = p.dernierDiplome_size
 WHERE s.del = 0 AND s.dernierDiplome IS NULL AND s.dernierDiplome_path IS NULL AND p.dernierDiplome_path IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

-- 3. Ligne renouvellement_stage manquante (uniquement les demandes encore en attente)
INSERT INTO renouvellement_stage
  (stage_actuel_idstage, stage_nouveau_idstage, dureeDemandee, statusRenouvellement,
   dateRenouvellement, createdDate, createdBy, del)
SELECT s.stage_parent_idstage, s.idstage, s.dureeStage, 'EN_ATTENTE',
       s.createdDate, s.createdDate, 'Migration renouvellements orphelins', 0
  FROM stage s
  JOIN stage p ON p.idstage = s.stage_parent_idstage AND p.del = 0
 WHERE s.del = 0
   AND s.statusStage = 'EN_ATTENTE'
   AND s.dureeStage IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM renouvellement_stage r WHERE r.stage_nouveau_idstage = s.idstage);

COMMIT;
