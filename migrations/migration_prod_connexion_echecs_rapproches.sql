-- =============================================================================
-- Migration : verrouillage de compte — seuls les échecs de connexion rapprochés comptent (2026-10-24)
--
-- Avant : users.failedLoginAttempts ne redescendait jamais (sauf connexion réussie). Un compte à 5 échecs
-- étalés sur des mois se reverrouillait 15 min à chaque nouvelle erreur, dès la première ; sur la copie
-- de production : 16 comptes à 5 échecs ou plus, 24 comptes à 1–4 échecs anciens.
-- Après : colonne dernierEchecConnexion (le compteur repart de 1 si le dernier échec date de plus de
-- 15 min) ; ici, remise à zéro des compteurs dont le verrou est terminé ou absent. Un verrou encore actif
-- au moment de la migration n'est pas touché (il expire de lui-même).
--
-- ⚠️ Le code déployé lit cette colonne : appliquer cette migration AVANT de redémarrer le serveur.
-- Idempotent (ADD COLUMN IF NOT EXISTS ; la remise à zéro ne retrouve plus rien à la relance).
-- Vérification : SELECT failedLoginAttempts, COUNT(*) FROM users WHERE del = 0 GROUP BY 1;
-- Retour arrière : ALTER TABLE users DROP COLUMN dernierEchecConnexion;
--   (les anciens compteurs ne sont pas restaurables ; ils ne servaient qu'à verrouiller à tort)
-- =============================================================================

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `dernierEchecConnexion` DATETIME NULL DEFAULT NULL
    COMMENT 'Date du dernier échec de connexion — seuls les échecs rapprochés (15 min) s''additionnent'
    AFTER `lockedUntil`;

START TRANSACTION;

UPDATE `users`
   SET `failedLoginAttempts` = 0,
       `lockedUntil` = NULL
 WHERE `failedLoginAttempts` > 0
   AND (`lockedUntil` IS NULL OR `lockedUntil` <= NOW());

COMMIT;
