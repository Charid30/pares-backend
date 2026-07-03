// src/services/offre.service.js
const fileStorage = require('../utils/fileStorage.util');
const {
  Offre,
  CandidatureOffre,
  Candidat,
  Agent,
  User,
  Direction,
} = require('../models');
const { Op } = require('sequelize');
const notifService = require('./notification.service');
const settingsService = require('./settings.service');

// =====================================================
// OFFRES
// =====================================================

/**
 * Créer une offre (par candidat)
 */
const createOffreByCandidat = async (candidatId, data, files) => {
  const offreData = {
    creePar: 'CANDIDAT',
    candidats_idcandidats: candidatId,
    agents_idagents: null,
    typeOffre: data.typeOffre,
    titre: data.titre,
    description: data.description,
    statusOffre: 'EN_ATTENTE',
  };
  
  // Ajouter les fichiers
  if (files.cnib) {
    offreData.cnib_path = fileStorage.saveFile(files.cnib[0].buffer, files.cnib[0].originalname, 'offres');
    offreData.cnib = null;
    offreData.cnib_filename = files.cnib[0].originalname;
    offreData.cnib_size = files.cnib[0].size;
  }

  if (files.demandeOffre) {
    offreData.demandeOffre_path = fileStorage.saveFile(files.demandeOffre[0].buffer, files.demandeOffre[0].originalname, 'offres');
    offreData.demandeOffre = null;
    offreData.demandeOffre_filename = files.demandeOffre[0].originalname;
    offreData.demandeOffre_size = files.demandeOffre[0].size;
  }

  // Auto-affecter la direction de l'agent par défaut si configuré
  try {
    const settings = await settingsService.getSettings();
    const dirId = await settingsService.resolveDefaultAgentDirection(settings.routage?.agentDefautOffre);
    if (dirId) offreData.direction_iddirection = dirId;
  } catch (e) {
    console.error('⚠️ Routage offre: impossible de résoudre l\'agent par défaut:', e.message);
  }

  const offre = await Offre.create(offreData);

  // Notifications email — en arrière-plan
  (async () => {
    try {
      const candidat = await Candidat.findOne({ where: { idcandidats: candidatId, del: 0 } });
      if (candidat) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendConfirmationSoumission(candidat, 'offre', [
          { label: 'Type', value: data.typeOffre },
          { label: 'Titre', value: data.titre },
        ], `${frontUrl}/dashboard/candidat/mes-offres`);
        await notifService.onNouvelleDemandeOffre(candidat, { typeOffre: data.typeOffre, titre: data.titre });
      }
    } catch (e) {
      console.error('❌ Email création offre:', e.message);
    }
  })();

  return offre;
};

/**
 * Créer une offre (par admin/agent)
 */
const createOffreByAdmin = async (userId, data) => {
  // Récupérer l'agent
  const agent = await Agent.findOne({
    include: [{
      model: User,
      as: 'users',
      where: { idusers: userId },
    }],
  });
  
  if (!agent) {
    throw new Error('Agent non trouvé');
  }
  
  return await Offre.create({
    creePar: 'ADMIN',
    candidats_idcandidats: null,
    agents_idagents: agent.idagents,
    typeOffre: data.typeOffre,
    titre: data.titre,
    description: data.description,
    conditionsRequises: data.conditionsRequises,
    documentsRequis: data.documentsRequis,
    dateDebut: data.dateDebut,
    dateFin: data.dateFin,
    nombreCandidaturesMax: data.nombreCandidaturesMax,
    nombreCandidaturesActuelles: 0,
    statusOffre: data.statusOffre || 'BROUILLON',
  });
};

/**
 * Obtenir toutes les offres
 */
const getAllOffres = async (filters = {}, directionId = null) => {
  const where = { del: 0 };

  if (filters.creePar) where.creePar = filters.creePar;
  if (filters.statusOffre) where.statusOffre = filters.statusOffre;
  if (filters.typeOffre) where.typeOffre = filters.typeOffre;
  // Restreindre à la direction de l'agent si pas d'accès global
  if (directionId) where.direction_iddirection = directionId;
  
  return await Offre.findAll({
    where,
    include: [
      {
        model: Candidat,
        as: 'candidatCreateur',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'ifu'],
        required: false,
      },
      {
        model: Agent,
        as: 'agentCreateur',
        attributes: ['idagents', 'nom', 'prenom', 'matricule'],
        required: false,
      },
      {
        model: Direction,
        as: 'direction',
        attributes: ['iddirection', 'nom', 'accronyme'],
        required: false,
      },
    ],
    order: [['createdDate', 'DESC']],
  });
};

/**
 * Obtenir les offres actives créées par admin (pour candidatures)
 */
const getOffresActivesAdmin = async () => {
  const today = new Date();
  
  return await Offre.findAll({
    where: {
      del: 0,
      creePar: 'ADMIN',
      statusOffre: 'ACTIVE',
      dateDebut: { [Op.lte]: today },
      dateFin: { [Op.gte]: today },
    },
    include: [
      {
        model: Agent,
        as: 'agentCreateur',
        attributes: ['idagents', 'nom', 'prenom'],
      },
    ],
  });
};

/**
 * Obtenir les offres créées par un candidat (avec pagination)
 */
const getOffresByCandidat = async (candidatId, options = {}) => {
  const page  = Math.max(1, parseInt(options.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await Offre.findAndCountAll({
    where: {
      candidats_idcandidats: candidatId,
      del: 0,
    },
    order: [['createdDate', 'DESC']],
    limit,
    offset,
  });

  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      hasNext: page < Math.ceil(count / limit),
      hasPrev: page > 1,
    },
  };
};

/**
 * Obtenir une offre par ID
 */
const getOffreById = async (id) => {
  const offre = await Offre.findOne({
    where: { idoffres: id, del: 0 },
    include: [
      {
        model: Candidat,
        as: 'candidatCreateur',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone', 'ifu'],
        required: false,
      },
      {
        model: Agent,
        as: 'agentCreateur',
        attributes: ['idagents', 'nom', 'prenom', 'matricule'],
        required: false,
      },
      {
        model: CandidatureOffre,
        as: 'candidatures',
        where: { del: 0 },
        required: false,
      },
    ],
  });
  
  if (!offre) {
    throw new Error('Offre non trouvée');
  }
  
  return offre;
};

/**
 * Mettre à jour une offre
 */
const updateOffre = async (id, data) => {
  const offre = await Offre.findOne({
    where: { idoffres: id, del: 0 },
  });
  
  if (!offre) {
    throw new Error('Offre non trouvée');
  }
  
  await offre.update(data);
  
  return offre;
};

/**
 * Évaluer une offre créée par un candidat
 */
const evaluateOffre = async (id, data) => {
  const offre = await Offre.findOne({
    where: { idoffres: id, creePar: 'CANDIDAT', del: 0 },
    include: [{ model: Candidat, as: 'candidatCreateur', attributes: ['idcandidats', 'nom', 'prenom', 'email'] }],
  });

  if (!offre) throw new Error('Offre non trouvée');

  await offre.update(data);

  // Notification au candidat — en arrière-plan
  (async () => {
    try {
      if (offre.candidatCreateur && (data.statusOffre === 'VALIDEE' || data.statusOffre === 'REJETEE')) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendDecisionEmail(
          offre.candidatCreateur, 'offre', data.statusOffre,
          [{ label: 'Titre', value: offre.titre }, { label: 'Type', value: offre.typeOffre }],
          `${frontUrl}/dashboard/candidat/mes-offres`,
          data.motifRefus || null
        );
      }
    } catch (e) {
      console.error('❌ Email décision offre:', e.message);
    }
  })();

  return offre;
};

/**
 * Supprimer une offre
 */
const deleteOffre = async (id) => {
  const offre = await Offre.findOne({
    where: { idoffres: id, del: 0 },
  });
  
  if (!offre) {
    throw new Error('Offre non trouvée');
  }
  
  await offre.update({ del: 1 });
  
  return { message: 'Offre supprimée avec succès' };
};

// =====================================================
// CANDIDATURES AUX OFFRES
// =====================================================

/**
 * Créer une candidature à une offre (créée par admin)
 */
const createCandidatureOffre = async (candidatId, offreId, files) => {
  // Vérifier que l'offre existe, est active et créée par admin
  const offre = await Offre.findOne({
    where: { 
      idoffres: offreId,
      creePar: 'ADMIN',
      statusOffre: 'ACTIVE',
      del: 0,
    },
  });
  
  if (!offre) {
    throw new Error('Offre non disponible pour candidature');
  }
  
  // Vérifier que le candidat n'a pas déjà postulé
  const existingCandidature = await CandidatureOffre.findOne({
    where: {
      offres_idoffres: offreId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
  });
  
  if (existingCandidature) {
    throw new Error('Vous avez déjà postulé à cette offre');
  }
  
  // Vérifier le nombre maximum de candidatures
  if (offre.nombreCandidaturesActuelles >= offre.nombreCandidaturesMax) {
    throw new Error('Le nombre maximum de candidatures est atteint');
  }
  
  const candidatureData = {
    offres_idoffres: offreId,
    candidats_idcandidats: candidatId,
    statusCandidature: 'SOUMISE',
  };
  
  // Ajouter les fichiers
  if (files.cnib) {
    candidatureData.cnib_path = fileStorage.saveFile(files.cnib[0].buffer, files.cnib[0].originalname, 'candidatures-offre');
    candidatureData.cnib = null;
    candidatureData.cnib_filename = files.cnib[0].originalname;
    candidatureData.cnib_size = files.cnib[0].size;
  }

  if (files.demandeCandidature) {
    candidatureData.demandeCandidature_path = fileStorage.saveFile(files.demandeCandidature[0].buffer, files.demandeCandidature[0].originalname, 'candidatures-offre');
    candidatureData.demandeCandidature = null;
    candidatureData.demandeCandidature_filename = files.demandeCandidature[0].originalname;
    candidatureData.demandeCandidature_size = files.demandeCandidature[0].size;
  }

  const candidature = await CandidatureOffre.create(candidatureData);
  
  // Incrémenter le compteur
  await offre.update({
    nombreCandidaturesActuelles: offre.nombreCandidaturesActuelles + 1,
  });
  
  return candidature;
};

/**
 * Obtenir les candidatures du candidat connecté
 */
const getCandidaturesByCandidat = async (candidatId) => {
  return await CandidatureOffre.findAll({
    where: { 
      candidats_idcandidats: candidatId,
      del: 0,
    },
    include: [
      {
        model: Offre,
        as: 'offre',
      },
    ],
    order: [['dateCandidature', 'DESC']],
  });
};

/**
 * Obtenir une candidature par ID
 */
const getCandidatureById = async (id) => {
  const candidature = await CandidatureOffre.findOne({
    where: { idcandidature: id, del: 0 },
    include: [
      {
        model: Offre,
        as: 'offre',
      },
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
      },
    ],
  });
  
  if (!candidature) {
    throw new Error('Candidature non trouvée');
  }
  
  return candidature;
};

/**
 * Évaluer une candidature
 */
const evaluateCandidature = async (id, data, evaluePar) => {
  const candidature = await CandidatureOffre.findOne({
    where: { idcandidature: id, del: 0 },
  });
  
  if (!candidature) {
    throw new Error('Candidature non trouvée');
  }
  
  await candidature.update({
    ...data,
    evaluePar,
    dateEvaluation: new Date(),
  });
  
  return candidature;
};

/**
 * Obtenir les candidatures d'une offre
 */
const getCandidaturesByOffre = async (offreId) => {
  return await CandidatureOffre.findAll({
    where: { 
      offres_idoffres: offreId,
      del: 0,
    },
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
      },
    ],
    order: [['dateCandidature', 'DESC']],
  });
};

/**
 * Transférer une offre vers une autre direction
 */
const transfererOffre = async (offreId, newDirectionId) => {
  const offre = await Offre.findOne({ where: { idoffres: offreId, del: 0 } });
  if (!offre) throw new Error('Offre non trouvée');

  const STATUTS_NON_TRANSFERABLES = ['REJETEE', 'CLOTUREE'];
  if (STATUTS_NON_TRANSFERABLES.includes(offre.statusOffre)) {
    throw new Error(`Cette offre ne peut pas être transférée (statut : ${offre.statusOffre})`);
  }

  if (offre.direction_iddirection === newDirectionId) {
    throw new Error('Cette offre est déjà rattachée à cette direction');
  }

  const direction = await Direction.findOne({ where: { iddirection: newDirectionId, del: 0 } });
  if (!direction) throw new Error('Direction non trouvée');

  await offre.update({ direction_iddirection: newDirectionId, lastModifiedDate: new Date() });
  return offre.reload({
    include: [
      { model: Candidat, as: 'candidatCreateur', attributes: ['idcandidats', 'nom', 'prenom', 'email'], required: false },
      { model: Direction, as: 'direction', attributes: ['iddirection', 'nom', 'accronyme'], required: false },
    ],
  });
};

module.exports = {
  // Offres
  createOffreByCandidat,
  createOffreByAdmin,
  getAllOffres,
  getOffresActivesAdmin,
  getOffresByCandidat,
  getOffreById,
  updateOffre,
  evaluateOffre,
  deleteOffre,
  transfererOffre,

  // Candidatures
  createCandidatureOffre,
  getCandidaturesByCandidat,
  getCandidatureById,
  evaluateCandidature,
  getCandidaturesByOffre,
};