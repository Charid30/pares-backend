// src/jobs/renouvellementRappelJob.js
// Rappel au candidat de la fin prochaine de son stage (demandé le 2026-11-26) :
// dès l'ouverture du renouvellement (DELAI_RENOUVELLEMENT_JOURS = 14 jours avant la fin) puis tous les deux jours,
// jusqu'au dernier jour du stage. Notification in-app, qui déclenche aussi le push.
// Pas de rappel si le stage est déjà renouvelé (une demande existe) ou si la limite de 6 mois continus est atteinte.
// Vérification toutes les heures, envois seulement en journée ; le dernier rappel (table notifications) évite les doublons.
const { Op } = require('sequelize');
const { Stage, Notification } = require('../models');
const inapp = require('../services/inapp.service');
const { getDureeContinueCandidat } = require('../services/stage.service');
const { DELAI_RENOUVELLEMENT_JOURS, DUREE_MAX_CONTINUE_MOIS } = require('../services/candidat.service');

const TYPE_NOTIF = 'RAPPEL_RENOUVELLEMENT';
const INTERVALLE_RAPPEL_JOURS = 2;
const HEURE_DEBUT = 8;   // pas de push la nuit
const HEURE_FIN = 19;
const JOUR_MS = 24 * 60 * 60 * 1000;
const MARGE_MS = 60 * 60 * 1000; // le job tourne toutes les heures : tolérance d'une heure sur les deux jours

const minuit = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const texteRappel = (stage, joursRestants) => {
  const fin = dateCourte(stage.dateFinEffective);
  const quand = joursRestants === 0 ? 'aujourd\'hui' : joursRestants === 1 ? 'demain' : `dans ${joursRestants} jours`;
  const titre = joursRestants === 0 ? 'Dernier jour pour renouveler votre stage' : 'Votre stage se termine bientôt';
  const message = `Votre stage (${stage.domaineStage || 'stage'}) se termine ${quand}, le ${fin}. `
    + (joursRestants === 0
      ? 'C\'est le dernier jour pour demander son renouvellement depuis « Mes stages ».'
      : 'Si vous souhaitez le prolonger, demandez son renouvellement depuis « Mes stages ».');
  return { titre, message };
};

/**
 * @param {Date} [maintenant] - injectable pour les tests
 * @returns {Promise<{ envoyes: number, ignores: number }>}
 */
const runRenouvellementRappelJob = async (maintenant = new Date()) => {
  const bilan = { envoyes: 0, ignores: 0 };
  const heure = maintenant.getHours();
  if (heure < HEURE_DEBUT || heure >= HEURE_FIN) return bilan;

  const aujourdhui = minuit(maintenant);
  const finFenetre = new Date(aujourdhui.getTime() + DELAI_RENOUVELLEMENT_JOURS * JOUR_MS);

  try {
    const stages = await Stage.findAll({
      where: {
        del: 0,
        statusStage: 'EN_COURS',
        dateFinEffective: { [Op.gte]: aujourdhui, [Op.lte]: finFenetre },
      },
      attributes: ['idstage', 'candidats_idcandidats', 'stage_parent_idstage', 'domaineStage', 'dateFinEffective'],
    });

    for (const stage of stages) {
      try {
        // Déjà renouvelé : une demande (quel que soit son statut) bloque une nouvelle demande
        const enfant = await Stage.count({ where: { stage_parent_idstage: stage.idstage, del: 0 } });
        if (enfant) { bilan.ignores += 1; continue; }

        // Limite de 6 mois continus atteinte : le renouvellement serait refusé
        const chaine = await getDureeContinueCandidat(stage.candidats_idcandidats, stage.stage_parent_idstage || stage.idstage);
        if ((chaine?.dureeTotaleMois || 0) >= DUREE_MAX_CONTINUE_MOIS) { bilan.ignores += 1; continue; }

        // Un rappel tous les deux jours au plus
        const recent = await Notification.findOne({
          where: {
            recipient_type: 'CANDIDAT',
            recipient_id: stage.candidats_idcandidats,
            type: TYPE_NOTIF,
            createdAt: { [Op.gt]: new Date(maintenant.getTime() - INTERVALLE_RAPPEL_JOURS * JOUR_MS + MARGE_MS) },
          },
        });
        if (recent) { bilan.ignores += 1; continue; }

        const joursRestants = Math.round((minuit(stage.dateFinEffective) - aujourdhui) / JOUR_MS);
        const { titre, message } = texteRappel(stage, joursRestants);
        await inapp.push({
          recipientType: 'CANDIDAT',
          recipientId: stage.candidats_idcandidats,
          type: TYPE_NOTIF,
          titre,
          message,
          link: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/dashboard/candidat/mes-stages`,
        });
        bilan.envoyes += 1;
      } catch (err) {
        console.error(`[RappelRenouvellement] Stage ${stage.idstage} :`, err.message);
      }
    }
    if (bilan.envoyes) console.log(`[RappelRenouvellement] ${bilan.envoyes} rappel(s) envoyé(s)`);
  } catch (err) {
    console.error('[RappelRenouvellement] Erreur :', err.message);
  }
  return bilan;
};

module.exports = { runRenouvellementRappelJob, TYPE_NOTIF };
