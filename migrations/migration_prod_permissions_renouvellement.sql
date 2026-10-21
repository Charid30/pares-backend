-- =============================================================================
-- Migration : module de permissions RENOUVELLEMENT (renouvellements de stage)
--
-- Le renouvellement avait jusqu'ici les permissions du module STAGE. Il a désormais son
-- propre module (écran Rôles et permissions), comme les suspensions (SUSPENSION_STAGE) :
--   CONSULTER, APPROUVER, VALIDER (accepter avec la convention), REJETER,
--   CREER (joindre / remplacer la convention), MODIFIER (dates du renouvellement).
-- Pour que personne ne perde l'accès au déploiement, chaque rôle reçoit sur RENOUVELLEMENT
-- les mêmes actions que celles qu'il a sur STAGE (parmi les six ci-dessus).
-- Idempotent : n'ajoute que les permissions absentes.
--
-- Vérification AVANT / APRÈS (après : une ligne RENOUVELLEMENT par ligne STAGE concernée) :
--   SELECT module, action, COUNT(*) FROM permissions
--   WHERE del = 0 AND module IN ('STAGE', 'RENOUVELLEMENT')
--     AND action IN ('CONSULTER','APPROUVER','VALIDER','REJETER','CREER','MODIFIER')
--   GROUP BY module, action ORDER BY action, module;
--
-- Retour arrière (le code déployé doit alors être l'ancien, qui lit STAGE) :
--   DELETE FROM permissions WHERE module = 'RENOUVELLEMENT';
-- =============================================================================

START TRANSACTION;

INSERT INTO permissions (role_idrole, module, action, del)
SELECT DISTINCT p.role_idrole, 'RENOUVELLEMENT', p.action, 0
FROM permissions p
WHERE p.module = 'STAGE'
  AND p.del = 0
  AND p.action IN ('CONSULTER', 'APPROUVER', 'VALIDER', 'REJETER', 'CREER', 'MODIFIER')
  AND NOT EXISTS (
    SELECT 1 FROM permissions r
    WHERE r.role_idrole = p.role_idrole
      AND r.module = 'RENOUVELLEMENT'
      AND r.action = p.action
      AND r.del = 0
  );

COMMIT;
