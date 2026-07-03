// src/jobs/stageStatusJob.js
// Job pour mettre a jour automatiquement les statuts des stages
const { Stage } = require('../models');
const { Op } = require('sequelize');

/**
 * Met a jour les stages ACCEPTE vers EN_COURS quand la dateDebutEffective est atteinte
 */
const activerStagesAcceptes = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const result = await Stage.update(
      {
        statusStage: 'EN_COURS',
        lastmodifiedDate: new Date()
      },
      {
        where: {
          statusStage: 'ACCEPTE',
          dateDebutEffective: {
            [Op.lte]: today
          },
          del: 0
        }
      }
    );

    if (result[0] > 0) {
      console.log(`[CRON] ${result[0]} stage(s) passe(s) en EN_COURS`);
    }

    return result[0];
  } catch (error) {
    console.error('[CRON] Erreur activation stages:', error.message);
    throw error;
  }
};

/**
 * Met a jour les stages EN_COURS vers EXPIRE quand la dateFinEffective est dépassée.
 * On utilise Op.lt (strict) : un stage dont dateFinEffective = aujourd'hui est encore
 * actif ce jour-là. Il n'expire qu'à partir du lendemain.
 */
const expirerStagesEnCours = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const result = await Stage.update(
      {
        statusStage: 'EXPIRE',
        lastmodifiedDate: new Date()
      },
      {
        where: {
          statusStage: 'EN_COURS',
          dateFinEffective: {
            [Op.lt]: today   // strict : le jour de fin est encore actif
          },
          del: 0
        }
      }
    );

    if (result[0] > 0) {
      console.log(`[CRON] ${result[0]} stage(s) passe(s) en EXPIRE`);
    }

    return result[0];
  } catch (error) {
    console.error('[CRON] Erreur expiration stages:', error.message);
    throw error;
  }
};

/**
 * Execute toutes les mises a jour de statut
 */
const updateAllStageStatuses = async () => {
  console.log('[CRON] Verification des statuts des stages...');

  try {
    const activated = await activerStagesAcceptes();
    const expired = await expirerStagesEnCours();

    console.log(`[CRON] Terminé - ${activated} active(s), ${expired} expire(s)`);

    return { activated, expired };
  } catch (error) {
    console.error('[CRON] Erreur mise a jour statuts:', error.message);
    throw error;
  }
};

module.exports = {
  activerStagesAcceptes,
  expirerStagesEnCours,
  updateAllStageStatuses
};
