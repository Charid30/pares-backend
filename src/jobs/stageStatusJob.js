// src/jobs/stageStatusJob.js
// Job pour mettre a jour automatiquement les statuts des stages
const { Stage, RenouvellementStage, Candidat } = require('../models');
const { Op } = require('sequelize');
const emailService = require('../services/email.service');

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
 * Synchronise les statuts des renouvellements d'après le statut réel du stageNouveau.
 * EN_COURS/EXPIRE/TERMINE sur le stage → même statut sur le renouvellement.
 * Envoie un email au candidat pour chaque transition.
 */
const syncRenouvellementStatuses = async () => {
  const SYNC = [
    { stageStatus: 'EN_COURS',       renewalStatus: 'EN_COURS', fromStatuses: ['ACCEPTE'],              emailFn: 'sendRenouvellementEnCoursEmail' },
    { stageStatus: 'EXPIRE',         renewalStatus: 'EXPIRE',   fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementExpireEmail' },
    { stageStatus: 'TERMINE',        renewalStatus: 'TERMINE',  fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementTermineEmail' },
    { stageStatus: 'RAPPORT_SOUMIS', renewalStatus: 'TERMINE',  fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementTermineEmail' },
  ];

  let total = 0;
  try {
    for (const { stageStatus, renewalStatus, fromStatuses, emailFn } of SYNC) {
      // 1. Trouver les renouvellements qui vont changer (avant update)
      const toUpdate = await RenouvellementStage.findAll({
        where: { statusRenouvellement: { [Op.in]: fromStatuses }, del: 0 },
        attributes: ['idrenouvellement', 'dureeDemandee', 'stage_nouveau_idstage'],
        include: [
          {
            model: Stage,
            as: 'stageNouveau',
            required: true,
            where: { statusStage: stageStatus, del: 0 },
            attributes: ['idstage', 'domaineStage', 'dateDebutEffective', 'dateFinEffective'],
            include: [
              {
                model: Candidat,
                as: 'candidat',
                attributes: ['idcandidats', 'nom', 'prenom', 'email'],
              },
            ],
          },
        ],
      });

      if (!toUpdate.length) continue;

      const ids = toUpdate.map(r => r.stage_nouveau_idstage);

      // 2. Mise à jour en masse avec audit
      const [count] = await RenouvellementStage.update(
        {
          statusRenouvellement: renewalStatus,
          lastModifiedBy: 'Système',
          lastModifiedDate: new Date(),
        },
        {
          where: {
            stage_nouveau_idstage: { [Op.in]: ids },
            statusRenouvellement:  { [Op.in]: fromStatuses },
            del: 0,
          },
        }
      );
      total += count;

      // 3. Emails asynchrones (non bloquants)
      for (const renouv of toUpdate) {
        const candidat = renouv.stageNouveau?.candidat;
        if (!candidat?.email) continue;
        const payload = {
          domaine: renouv.stageNouveau?.domaineStage,
          dureeDemandee: renouv.dureeDemandee,
          dateDebut: renouv.stageNouveau?.dateDebutEffective,
          dateFin: renouv.stageNouveau?.dateFinEffective,
        };
        emailService[emailFn](candidat, payload).catch(e =>
          console.error(`[CRON] Email ${emailFn} failed:`, e.message)
        );
      }
    }

    if (total > 0) {
      console.log(`[CRON] ${total} renouvellement(s) synchronisé(s)`);
    }
    return total;
  } catch (error) {
    console.error('[CRON] Erreur sync renouvellements:', error.message);
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
    const synced = await syncRenouvellementStatuses();

    console.log(`[CRON] Terminé - ${activated} active(s), ${expired} expire(s), ${synced} renouvellement(s) sync`);

    return { activated, expired, synced };
  } catch (error) {
    console.error('[CRON] Erreur mise a jour statuts:', error.message);
    throw error;
  }
};

module.exports = {
  activerStagesAcceptes,
  expirerStagesEnCours,
  syncRenouvellementStatuses,
  updateAllStageStatuses
};
