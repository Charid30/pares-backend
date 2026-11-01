-- =============================================================================
-- Migration : permission STAGE/ATTESTER pour le rôle SOUS_ADMIN RH
--
-- Aucun rôle ne pouvait joindre une attestation de stage (seul l'admin le pouvait).
-- Le rôle SOUS_ADMIN RH (lecture globale) reçoit « Joindre Attestation » : ses agents
-- joignent les attestations de toutes les directions. Les agents concernés doivent se
-- reconnecter (ou faire F5) pour que la permission s'applique.
-- Idempotent : n'ajoute la permission que si elle est absente.
--
-- Vérification AVANT (0 ligne) / APRÈS (1 ligne, del = 0) :
--   SELECT p.idpermission, r.accronyme, p.module, p.action, p.del
--   FROM permissions p JOIN role r ON r.idrole = p.role_idrole
--   WHERE r.accronyme = 'SOUS_ADMIN RH' AND p.module = 'STAGE'
--     AND p.action = 'ATTESTER' AND p.del = 0;
--
-- Retour arrière :
--   UPDATE permissions p JOIN role r ON r.idrole = p.role_idrole
--   SET p.del = 1
--   WHERE r.accronyme = 'SOUS_ADMIN RH' AND p.module = 'STAGE' AND p.action = 'ATTESTER';
-- =============================================================================

START TRANSACTION;

INSERT INTO permissions (role_idrole, module, action, del)
SELECT r.idrole, 'STAGE', 'ATTESTER', 0
FROM role r
WHERE r.accronyme = 'SOUS_ADMIN RH'
  AND r.del = 0
  AND NOT EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.role_idrole = r.idrole
      AND p.module = 'STAGE'
      AND p.action = 'ATTESTER'
      AND p.del = 0
  );

COMMIT;
