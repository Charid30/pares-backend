// src/jobs/stageStatusJob.js
// Job pour mettre a jour automatiquement les statuts des stages
const { Stage, RenouvellementStage, Candidat, DocumentStage } = require('../models');
const { Op } = require('sequelize');
const emailService = require('../services/email.service');
const inapp = require('../services/inapp.service');
const notifService = require('../services/notification.service');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';
const LIEN_MES_STAGES = `${FRONTEND}/dashboard/candidat/mes-stages`;

/** Notification in-app + push au candidat (jamais bloquant). */
const notifierCandidat = (candidatId, type, titre, message) => {
  if (!candidatId) return Promise.resolve();
  return inapp.push({ recipientType: 'CANDIDAT', recipientId: candidatId, type, titre, message, link: LIEN_MES_STAGES })
    .catch(e => console.error('[CRON] Notification candidat:', e.message));
};

// Délai avant la mise en traitement automatique d'une demande déposée
const DELAI_MISE_EN_TRAITEMENT_MS = 60 * 60 * 1000; // 1 heure

/**
 * Passe en EN_COURS_DE_TRAITEMENT les demandes de stage EN_ATTENTE déposées (ou re-soumises)
 * depuis au moins une heure : le dépôt exige déjà toutes les pièces, l'étape « Traiter » n'est
 * plus manuelle. Les renouvellements (stages enfants) suivent leur propre circuit.
 */
const mettreEnTraitementDemandes = async () => {
  const limite = new Date(Date.now() - DELAI_MISE_EN_TRAITEMENT_MS);

  try {
    const demandes = await Stage.findAll({
      attributes: ['idstage', 'candidats_idcandidats', 'domaineStage'],
      where: {
        statusStage: 'EN_ATTENTE',
        stage_parent_idstage: null,
        del: 0,
        [Op.or]: [
          { dateResoumission: { [Op.lte]: limite } },
          { dateResoumission: null, createdDate: { [Op.lte]: limite } },
        ],
      },
    });
    if (demandes.length === 0) return 0;

    const [count] = await Stage.update(
      { statusStage: 'EN_COURS_DE_TRAITEMENT', lastmodifiedDate: new Date() },
      { where: { idstage: { [Op.in]: demandes.map(s => s.idstage) }, statusStage: 'EN_ATTENTE' } }
    );

    for (const s of demandes) {
      await notifierCandidat(s.candidats_idcandidats, 'STAGE_EN_TRAITEMENT', 'Demande de stage en traitement',
        `Votre demande de stage (${s.domaineStage}) est en cours de traitement par nos services.`);
    }

    if (count > 0) {
      console.log(`[CRON] ${count} demande(s) de stage passée(s) en traitement`);
    }
    return count;
  } catch (error) {
    console.error('[CRON] Erreur mise en traitement:', error.message);
    throw error;
  }
};

// Délai sans action de la direction avant l'approbation automatique d'un renouvellement
const DELAI_APPROBATION_AUTO_RENOUVELLEMENT_MS = 48 * 60 * 60 * 1000; // 48 h, week-end compris

/**
 * Approuve automatiquement (EN_ATTENTE → PROGRAMMATION_EN_COURS) les demandes de renouvellement
 * restées 48 h sans évolution : les agents RH peuvent alors joindre la convention. Le délai part de
 * dateEnAttente (soumission, re-soumission, réouverture, annulation de l'approbation).
 */
const approuverRenouvellementsAutomatiquement = async () => {
  const limite = new Date(Date.now() - DELAI_APPROBATION_AUTO_RENOUVELLEMENT_MS);

  try {
    const aApprouver = await RenouvellementStage.findAll({
      attributes: ['idrenouvellement', 'dureeDemandee'],
      where: {
        statusRenouvellement: 'EN_ATTENTE',
        del: 0,
        [Op.or]: [
          { dateEnAttente: { [Op.lte]: limite } },
          { dateEnAttente: null, dateRenouvellement: { [Op.lte]: limite } },
        ],
      },
      include: [{
        model: Stage,
        as: 'stageNouveau',
        attributes: ['idstage'],
        include: [{ model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom'] }],
      }],
    });
    if (aApprouver.length === 0) return 0;

    const [count] = await RenouvellementStage.update(
      {
        statusRenouvellement: 'PROGRAMMATION_EN_COURS',
        lastModifiedBy: 'Système (approbation automatique après 48 h)',
        lastModifiedDate: new Date(),
      },
      { where: { idrenouvellement: { [Op.in]: aApprouver.map(r => r.idrenouvellement) }, statusRenouvellement: 'EN_ATTENTE' } }
    );

    for (const r of aApprouver) {
      await notifierCandidat(r.stageNouveau?.candidat?.idcandidats, 'RENOUVELLEMENT_APPROUVE', 'Renouvellement approuvé ✓',
        'Votre demande de renouvellement est approuvée : elle est en cours de programmation.');
    }
    // Un seul envoi groupé aux agents RH
    await notifService.onRenouvellementsAProgrammer(aApprouver.map(r => ({
      candidat: r.stageNouveau?.candidat ? `${r.stageNouveau.candidat.prenom} ${r.stageNouveau.candidat.nom}` : `Renouvellement n°${r.idrenouvellement}`,
      dureeDemandee: r.dureeDemandee,
    })), true);

    if (count > 0) {
      console.log(`[CRON] ${count} renouvellement(s) approuvé(s) automatiquement`);
    }
    return count;
  } catch (error) {
    console.error('[CRON] Erreur approbation automatique des renouvellements:', error.message);
    throw error;
  }
};

/**
 * Met a jour les stages ACCEPTE vers EN_COURS quand la dateDebutEffective est atteinte
 * ET que leur convention est jointe (un stage n'est validé qu'avec sa convention)
 */
const activerStagesAcceptes = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Un stage n'est validé que lorsque sa convention est jointe : sans convention,
    // il reste ACCEPTE même si sa date de début est passée.
    const aActiver = await Stage.findAll({
      attributes: ['idstage', 'candidats_idcandidats', 'domaineStage', 'stage_parent_idstage'],
      where: {
        statusStage: 'ACCEPTE',
        dateDebutEffective: { [Op.lte]: today },
        del: 0,
      },
      include: [{
        model: DocumentStage,
        as: 'documents',
        attributes: [],
        where: { typeDocument: 'CONVENTION', del: 0 },
        required: true,
      }],
    });
    if (aActiver.length === 0) return 0;

    const result = await Stage.update(
      {
        statusStage: 'EN_COURS',
        lastmodifiedDate: new Date()
      },
      {
        where: { idstage: { [Op.in]: aActiver.map(s => s.idstage) } }
      }
    );

    // Les renouvellements (stages enfants) sont notifiés par syncRenouvellementStatuses
    for (const s of aActiver.filter(x => !x.stage_parent_idstage)) {
      await notifierCandidat(s.candidats_idcandidats, 'STAGE_EN_COURS', 'Votre stage a commencé',
        `Votre stage (${s.domaineStage}) a commencé. Bon stage !`);
    }

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
    const whereExpiration = {
      statusStage: 'EN_COURS',
      dateFinEffective: {
        [Op.lt]: today   // strict : le jour de fin est encore actif
      },
      del: 0
    };
    const aExpirer = await Stage.findAll({
      attributes: ['idstage', 'candidats_idcandidats', 'domaineStage', 'stage_parent_idstage'],
      where: whereExpiration,
    });

    const result = await Stage.update(
      {
        statusStage: 'EXPIRE',
        lastmodifiedDate: new Date()
      },
      { where: whereExpiration }
    );

    // Demande de stage terminée : rappel du rapport, sauf si un renouvellement prend le relais
    // (les renouvellements sont notifiés par syncRenouvellementStatuses)
    for (const s of aExpirer.filter(x => !x.stage_parent_idstage)) {
      const prolonge = await Stage.count({
        where: {
          stage_parent_idstage: s.idstage,
          del: 0,
          statusStage: { [Op.in]: ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'EN_COURS', 'SUSPENDU'] },
        },
      });
      if (prolonge) continue;
      await notifierCandidat(s.candidats_idcandidats, 'STAGE_EXPIRE', 'Votre stage est terminé',
        `Votre stage (${s.domaineStage}) est terminé. Pensez à déposer votre rapport de stage.`);
    }

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
    { stageStatus: 'EN_COURS',       renewalStatus: 'EN_COURS', fromStatuses: ['ACCEPTE'],              emailFn: 'sendRenouvellementEnCoursEmail',
      titre: 'Votre renouvellement a commencé', message: 'La prolongation de votre stage a commencé.' },
    { stageStatus: 'EXPIRE',         renewalStatus: 'EXPIRE',   fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementExpireEmail',
      titre: 'Votre renouvellement est terminé', message: 'La prolongation de votre stage est terminée. Pensez à déposer votre rapport de stage.' },
    { stageStatus: 'TERMINE',        renewalStatus: 'TERMINE',  fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementTermineEmail',
      titre: 'Renouvellement clôturé', message: 'Votre renouvellement de stage est clôturé.' },
    { stageStatus: 'RAPPORT_SOUMIS', renewalStatus: 'TERMINE',  fromStatuses: ['EN_COURS', 'ACCEPTE'],  emailFn: 'sendRenouvellementTermineEmail',
      titre: 'Renouvellement clôturé', message: 'Votre renouvellement de stage est clôturé.' },
  ];

  let total = 0;
  try {
    for (const { stageStatus, renewalStatus, fromStatuses, emailFn, titre, message } of SYNC) {
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
        notifierCandidat(candidat.idcandidats, `RENOUVELLEMENT_${renewalStatus}`, titre, message);
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
    const enTraitement = await mettreEnTraitementDemandes();
    const renouvellementsApprouves = await approuverRenouvellementsAutomatiquement();
    const activated = await activerStagesAcceptes();
    const expired = await expirerStagesEnCours();
    const synced = await syncRenouvellementStatuses();

    console.log(`[CRON] Terminé - ${enTraitement} en traitement, ${renouvellementsApprouves} renouvellement(s) approuvé(s), ${activated} active(s), ${expired} expire(s), ${synced} renouvellement(s) sync`);

    return { enTraitement, renouvellementsApprouves, activated, expired, synced };
  } catch (error) {
    console.error('[CRON] Erreur mise a jour statuts:', error.message);
    throw error;
  }
};

module.exports = {
  mettreEnTraitementDemandes,
  approuverRenouvellementsAutomatiquement,
  activerStagesAcceptes,
  expirerStagesEnCours,
  syncRenouvellementStatuses,
  updateAllStageStatuses
};
