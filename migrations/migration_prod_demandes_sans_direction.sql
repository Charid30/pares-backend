-- =============================================================================
-- Migration : demandes sans direction (offres, aides, audiences) — 2026-11-05
--
-- Depuis cette version, le candidat choisit la direction concernée au dépôt (offres et aides, comme les audiences).
-- Les demandes déposées avant, sans direction, ne sont visibles que de l'admin ; décision de l'utilisateur :
--   - offres et aides sans direction → CAB (Cabinet) ;
--   - audiences sans direction       → DG (Direction Générale).
-- Le statut n'est pas modifié. Chaque ligne déplacée est tracée (transferePar / transfereDate) : c'est ce qui
-- permet le retour arrière. Ajoute aussi aux offres les colonnes de traçabilité déjà présentes sur aides et audiences.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS ; seules les lignes encore sans direction sont modifiées.
-- Si CAB ou DG n'existe pas (accronyme), les lignes concernées restent sans direction.
--
-- Vérification avant / après :
--   SELECT 'offres', COUNT(*) FROM offres WHERE del = 0 AND direction_iddirection IS NULL
--   UNION ALL SELECT 'aides', COUNT(*) FROM aides WHERE del = 0 AND direction_iddirection IS NULL
--   UNION ALL SELECT 'audiences', COUNT(*) FROM demande_audience WHERE del = 0 AND direction_iddirection IS NULL;
--   -- après : 0 partout
--   SELECT 'offres', COUNT(*) FROM offres WHERE transferePar = 'Migration demandes sans direction'
--   UNION ALL SELECT 'aides', COUNT(*) FROM aides WHERE transferePar = 'Migration demandes sans direction'
--   UNION ALL SELECT 'audiences', COUNT(*) FROM demande_audience WHERE transferePar = 'Migration demandes sans direction';
--
-- Retour arrière (seulement les lignes déplacées par cette migration et pas redirigées depuis) :
--   UPDATE offres           SET direction_iddirection = NULL, transferePar = NULL, transfereDate = NULL WHERE transferePar = 'Migration demandes sans direction';
--   UPDATE aides            SET direction_iddirection = NULL, transferePar = NULL, transfereDate = NULL WHERE transferePar = 'Migration demandes sans direction';
--   UPDATE demande_audience SET direction_iddirection = NULL, transferePar = NULL, transfereDate = NULL WHERE transferePar = 'Migration demandes sans direction';
-- =============================================================================

ALTER TABLE `offres`
  ADD COLUMN IF NOT EXISTS `transfereParId` INT          NULL DEFAULT NULL COMMENT 'ID de l''agent ayant redirigé l''offre',
  ADD COLUMN IF NOT EXISTS `transferePar`   VARCHAR(150) NULL DEFAULT NULL COMMENT 'Nom de l''agent ayant redirigé l''offre (snapshot)',
  ADD COLUMN IF NOT EXISTS `transfereDate`  DATETIME     NULL DEFAULT NULL COMMENT 'Date de la dernière redirection';

START TRANSACTION;

SET @cab = (SELECT `iddirection` FROM `direction` WHERE `accronyme` = 'CAB' AND `del` = 0 ORDER BY `iddirection` LIMIT 1);
SET @dg  = (SELECT `iddirection` FROM `direction` WHERE `accronyme` = 'DG'  AND `del` = 0 ORDER BY `iddirection` LIMIT 1);

UPDATE `offres`
   SET `direction_iddirection` = @cab, `transferePar` = 'Migration demandes sans direction', `transfereDate` = NOW()
 WHERE `del` = 0 AND `direction_iddirection` IS NULL AND @cab IS NOT NULL;

UPDATE `aides`
   SET `direction_iddirection` = @cab, `transferePar` = 'Migration demandes sans direction', `transfereDate` = NOW()
 WHERE `del` = 0 AND `direction_iddirection` IS NULL AND @cab IS NOT NULL;

UPDATE `demande_audience`
   SET `direction_iddirection` = @dg, `transferePar` = 'Migration demandes sans direction', `transfereDate` = NOW()
 WHERE `del` = 0 AND `direction_iddirection` IS NULL AND @dg IS NOT NULL;

COMMIT;

SELECT 'Migration demandes_sans_direction terminée' AS resultat;
