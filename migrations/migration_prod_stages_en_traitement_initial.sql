-- =============================================================================
-- Migration : mise « En traitement » des demandes de stage déjà déposées, sans notification
--
-- Nouveau circuit (2026-10-21) : une demande de stage passe automatiquement EN_ATTENTE →
-- EN_COURS_DE_TRAITEMENT une heure après son dépôt (stageStatusJob.mettreEnTraitementDemandes),
-- avec une notification in-app + push au candidat ; le bouton « Traiter » disparaît.
-- Au déploiement, le job notifierait d'un coup tous les candidats ayant une demande en attente,
-- y compris pour des dossiers anciens : cette migration les passe « En traitement » à l'avance,
-- sans notification. Seules les nouvelles demandes seront notifiées.
--
-- Périmètre : demandes de stage (stages racines, stage_parent_idstage NULL) au statut EN_ATTENTE.
-- Les renouvellements (stages enfants) suivent leur propre circuit et ne sont pas touchés.
-- lastmodifiedDate = maintenant, comme le job : la relance des approbateurs (stageRelanceJob)
-- ne partira qu'après 7 jours sans approbation.
--
-- ⚠️ À appliquer AVANT de redémarrer le serveur avec le nouveau code
--    (git pull → npm run migrate → redémarrage), sinon le job notifie les candidats.
--
-- Idempotent : ne touche que les demandes encore EN_ATTENTE.
--
-- Vérification AVANT / APRÈS (doit renvoyer 0 après) :
--   SELECT COUNT(*) FROM stage WHERE del = 0 AND stage_parent_idstage IS NULL AND statusStage = 'EN_ATTENTE';
--
-- Retour arrière : impossible à distinguer ensuite des demandes mises en traitement par le job ;
-- relever les identifiants avant application si besoin :
--   SELECT idstage FROM stage WHERE del = 0 AND stage_parent_idstage IS NULL AND statusStage = 'EN_ATTENTE';
-- =============================================================================

START TRANSACTION;

UPDATE stage
   SET statusStage      = 'EN_COURS_DE_TRAITEMENT',
       lastmodifiedDate = NOW()
 WHERE del = 0
   AND stage_parent_idstage IS NULL
   AND statusStage = 'EN_ATTENTE';

COMMIT;
