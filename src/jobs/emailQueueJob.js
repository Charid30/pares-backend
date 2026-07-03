// src/jobs/emailQueueJob.js
// Vérifie et traite la file d'attente des emails toutes les 5 minutes.
// Les emails mis en file (limite 450/jour atteinte) sont envoyés automatiquement
// le lendemain dès que le job détecte un changement de date.

const { processEmailQueue } = require('../services/email.service');

const runEmailQueueJob = async () => {
  try {
    const result = await processEmailQueue();
    if (result.sent > 0 || result.failed > 0) {
      console.log(`[EMAIL QUEUE JOB] Résultat : ${result.sent} envoyé(s), ${result.failed} échec(s), ${result.remaining} restant(s)`);
    }
  } catch (err) {
    console.error('[EMAIL QUEUE JOB] Erreur :', err.message);
  }
};

module.exports = { runEmailQueueJob };
