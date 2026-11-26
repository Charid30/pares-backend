// src/jobs/index.js
// Initialisation des taches planifiees (cron jobs)

const { updateAllStageStatuses } = require('./stageStatusJob');
const { runEmailQueueJob } = require('./emailQueueJob');
const { runAideReminderJob } = require('./aideReminderJob');
const { runStageRelanceJob } = require('./stageRelanceJob');
const { runRenouvellementRappelJob } = require('./renouvellementRappelJob');

const STATUS_CHECK_INTERVAL  = 60 * 60 * 1000;       // 1 heure
const EMAIL_QUEUE_INTERVAL   =  5 * 60 * 1000;       // 5 minutes
const AIDE_REMINDER_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 jours
// Relance des agents (demandes de stage bloquées) : vérification quotidienne,
// une relance par agent et par semaine au plus (voir stageRelanceJob)
const STAGE_RELANCE_INTERVAL = 24 * 60 * 60 * 1000;     // 1 jour
const STAGE_RELANCE_DEMARRAGE = 5 * 60 * 1000;          // 5 minutes après le démarrage

let statusCheckInterval  = null;
let emailQueueInterval   = null;
let aideReminderInterval = null;
let stageRelanceInterval = null;
let stageRelanceDemarrage = null;
let rappelRenouvellementInterval = null;
let rappelRenouvellementDemarrage = null;
// Rappel au candidat de la fin de son stage (renouvellement) : vérification toutes les heures,
// un rappel tous les deux jours au plus, en journée (voir renouvellementRappelJob)
const RAPPEL_RENOUVELLEMENT_INTERVAL = 60 * 60 * 1000;   // 1 heure
const RAPPEL_RENOUVELLEMENT_DEMARRAGE = 10 * 60 * 1000;  // 10 minutes après le démarrage

/**
 * Execute toutes les verifications de statuts
 */
const runAllStatusChecks = async () => {
  try {
    await updateAllStageStatuses();
  } catch (error) {
    console.error('[JOBS] Erreur verification statuts:', error.message);
  }
};

/**
 * Demarre toutes les taches planifiees
 */
const startAllJobs = () => {
  console.log('[JOBS] Demarrage des taches planifiees...');

  // Vérifications de statut (stages, campagnes) — toutes les heures
  runAllStatusChecks();
  statusCheckInterval = setInterval(runAllStatusChecks, STATUS_CHECK_INTERVAL);

  // File d'attente des emails — toutes les 5 minutes
  emailQueueInterval = setInterval(runEmailQueueJob, EMAIL_QUEUE_INTERVAL);

  // Rappel aides sans date — toutes les semaines
  aideReminderInterval = setInterval(runAideReminderJob, AIDE_REMINDER_INTERVAL);

  // Relance des agents sur les demandes de stage bloquées — tous les jours
  stageRelanceDemarrage = setTimeout(runStageRelanceJob, STAGE_RELANCE_DEMARRAGE);
  stageRelanceInterval = setInterval(runStageRelanceJob, STAGE_RELANCE_INTERVAL);

  // Rappel de fin de stage au candidat (renouvellement) — toutes les heures, envois en journée
  rappelRenouvellementDemarrage = setTimeout(() => runRenouvellementRappelJob(), RAPPEL_RENOUVELLEMENT_DEMARRAGE);
  rappelRenouvellementInterval = setInterval(() => runRenouvellementRappelJob(), RAPPEL_RENOUVELLEMENT_INTERVAL);

  console.log(`[JOBS] Statuts : ${STATUS_CHECK_INTERVAL / 60000}min | File emails : ${EMAIL_QUEUE_INTERVAL / 60000}min | Rappel aides : 7j | Relance stages : 1j | Rappel renouvellement : 1h`);
};

/**
 * Arrete toutes les taches planifiees
 */
const stopAllJobs = () => {
  if (statusCheckInterval)  { clearInterval(statusCheckInterval);  statusCheckInterval  = null; }
  if (emailQueueInterval)   { clearInterval(emailQueueInterval);   emailQueueInterval   = null; }
  if (aideReminderInterval) { clearInterval(aideReminderInterval); aideReminderInterval = null; }
  if (stageRelanceInterval) { clearInterval(stageRelanceInterval); stageRelanceInterval = null; }
  if (stageRelanceDemarrage) { clearTimeout(stageRelanceDemarrage); stageRelanceDemarrage = null; }
  if (rappelRenouvellementInterval) { clearInterval(rappelRenouvellementInterval); rappelRenouvellementInterval = null; }
  if (rappelRenouvellementDemarrage) { clearTimeout(rappelRenouvellementDemarrage); rappelRenouvellementDemarrage = null; }
  console.log('[JOBS] Taches planifiees arretees');
};

module.exports = {
  startAllJobs,
  stopAllJobs,
  updateAllStageStatuses,
  runAllStatusChecks
};
