// src/jobs/index.js
// Initialisation des taches planifiees (cron jobs)

const { updateAllStageStatuses } = require('./stageStatusJob');
const { runEmailQueueJob } = require('./emailQueueJob');

const STATUS_CHECK_INTERVAL  = 60 * 60 * 1000; // 1 heure
const EMAIL_QUEUE_INTERVAL   =  5 * 60 * 1000; // 5 minutes

let statusCheckInterval = null;
let emailQueueInterval  = null;

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

  console.log(`[JOBS] Statuts : toutes les ${STATUS_CHECK_INTERVAL / 60000} min | File emails : toutes les ${EMAIL_QUEUE_INTERVAL / 60000} min`);
};

/**
 * Arrete toutes les taches planifiees
 */
const stopAllJobs = () => {
  if (statusCheckInterval) { clearInterval(statusCheckInterval); statusCheckInterval = null; }
  if (emailQueueInterval)  { clearInterval(emailQueueInterval);  emailQueueInterval  = null; }
  console.log('[JOBS] Taches planifiees arretees');
};

module.exports = {
  startAllJobs,
  stopAllJobs,
  updateAllStageStatuses,
  runAllStatusChecks
};
