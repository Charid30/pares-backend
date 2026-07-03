// src/services/aide.service.js
const fileStorage = require('../utils/fileStorage.util');
const {
  Aide,
  CandidatureAide,
  Candidat,
  Agent,
  User,
} = require('../models');
const { Op } = require('sequelize');
const notifService = require('./notification.service');

// =====================================================
// AIDES
// =====================================================

/**
 * Créer une aide (par candidat)
 */
const createAideByCandidat = async (candidatId, data, files) => {
  const aideData = {
    creePar: 'CANDIDAT',
    candidats_idcandidats: candidatId,
    agents_idagents: null,
    typeAide: data.typeAide,
    titre: data.titre,
    description: data.description,
    statusAide: 'EN_ATTENTE',
  };
  
  // Ajouter les fichiers
  if (files.cnib) {
    aideData.cnib_path = fileStorage.saveFile(files.cnib[0].buffer, files.cnib[0].originalname, 'aides');
    aideData.cnib = null;
    aideData.cnib_filename = files.cnib[0].originalname;
    aideData.cnib_size = files.cnib[0].size;
  }

  if (files.demandeAide) {
    aideData.demandeAide_path = fileStorage.saveFile(files.demandeAide[0].buffer, files.demandeAide[0].originalname, 'aides');
    aideData.demandeAide = null;
    aideData.demandeAide_filename = files.demandeAide[0].originalname;
    aideData.demandeAide_size = files.demandeAide[0].size;
  }

  const aide = await Aide.create(aideData);

  // Notifications email — en arrière-plan
  (async () => {
    try {
      const candidat = await Candidat.findOne({ where: { idcandidats: candidatId, del: 0 } });
      if (candidat) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendConfirmationSoumission(candidat, 'aide', [
          { label: 'Type', value: data.typeAide },
          { label: 'Titre', value: data.titre },
        ], `${frontUrl}/dashboard/candidat/mes-aides`);
        await notifService.onNouvelleDemandeAide(candidat, { typeAide: data.typeAide, titre: data.titre });
      }
    } catch (e) {
      console.error('❌ Email création aide:', e.message);
    }
  })();

  return aide;
};

/**
 * Créer une aide (par admin/agent)
 */
const createAideByAdmin = async (userId, data) => {
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
  
  return await Aide.create({
    creePar: 'ADMIN',
    candidats_idcandidats: null,
    agents_idagents: agent.idagents,
    typeAide: data.typeAide,
    titre: data.titre,
    description: data.description,
    conditionsRequises: data.conditionsRequises,
    documentsRequis: data.documentsRequis,
    dateDebut: data.dateDebut,
    dateFin: data.dateFin,
    nombreBeneficiairesMax: data.nombreBeneficiairesMax,
    nombreBeneficiairesActuels: 0,
    statusAide: data.statusAide || 'BROUILLON',
  });
};

/**
 * Obtenir toutes les aides
 */
const getAllAides = async (filters = {}) => {
  const where = { del: 0 };
  
  if (filters.creePar) {
    where.creePar = filters.creePar;
  }
  
  if (filters.statusAide) {
    where.statusAide = filters.statusAide;
  }
  
  if (filters.typeAide) {
    where.typeAide = filters.typeAide;
  }
  
  return await Aide.findAll({
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
    ],
    order: [['createdDate', 'DESC']],
  });
};

/**
 * Obtenir les aides actives créées par admin (pour candidatures)
 */
const getAidesActivesAdmin = async () => {
  const today = new Date();
  
  return await Aide.findAll({
    where: {
      del: 0,
      creePar: 'ADMIN',
      statusAide: 'ACTIVE',
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
 * Obtenir les aides créées par un candidat (avec pagination)
 */
const getAidesByCandidat = async (candidatId, options = {}) => {
  const page  = Math.max(1, parseInt(options.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await Aide.findAndCountAll({
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
 * Obtenir une aide par ID
 */
const getAideById = async (id) => {
  const aide = await Aide.findOne({
    where: { idaide: id, del: 0 },
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
        model: CandidatureAide,
        as: 'candidatures',
        where: { del: 0 },
        required: false,
      },
    ],
  });
  
  if (!aide) {
    throw new Error('Aide non trouvée');
  }
  
  return aide;
};

/**
 * Mettre à jour une aide
 */
const updateAide = async (id, data) => {
  const aide = await Aide.findOne({
    where: { idaide: id, del: 0 },
  });
  
  if (!aide) {
    throw new Error('Aide non trouvée');
  }
  
  await aide.update(data);
  
  return aide;
};

/**
 * Évaluer une aide créée par un candidat
 */
const evaluateAide = async (id, data) => {
  const aide = await Aide.findOne({
    where: { idaide: id, creePar: 'CANDIDAT', del: 0 },
    include: [{ model: Candidat, as: 'candidatCreateur', attributes: ['idcandidats', 'nom', 'prenom', 'email'] }],
  });

  if (!aide) throw new Error('Aide non trouvée');

  await aide.update(data);

  // Notification au candidat — en arrière-plan
  (async () => {
    try {
      if (aide.candidatCreateur && (data.statusAide === 'VALIDEE' || data.statusAide === 'REJETEE')) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendDecisionEmail(
          aide.candidatCreateur, 'aide', data.statusAide,
          [{ label: 'Titre', value: aide.titre }, { label: 'Type', value: aide.typeAide }],
          `${frontUrl}/dashboard/candidat/mes-aides`,
          data.motifRefus || null
        );
      }
    } catch (e) {
      console.error('❌ Email décision aide:', e.message);
    }
  })();

  return aide;
};

/**
 * Supprimer une aide
 */
const deleteAide = async (id) => {
  const aide = await Aide.findOne({
    where: { idaide: id, del: 0 },
  });
  
  if (!aide) {
    throw new Error('Aide non trouvée');
  }
  
  await aide.update({ del: 1 });
  
  return { message: 'Aide supprimée avec succès' };
};

// =====================================================
// CANDIDATURES AUX AIDES
// =====================================================

/**
 * Créer une candidature à une aide (créée par admin)
 */
const createCandidatureAide = async (candidatId, aideId, files) => {
  // Vérifier que l'aide existe, est active et créée par admin
  const aide = await Aide.findOne({
    where: { 
      idaide: aideId,
      creePar: 'ADMIN',
      statusAide: 'ACTIVE',
      del: 0,
    },
  });
  
  if (!aide) {
    throw new Error('Aide non disponible pour candidature');
  }
  
  // Vérifier que le candidat n'a pas déjà postulé
  const existingCandidature = await CandidatureAide.findOne({
    where: {
      aides_idaide: aideId,
      candidats_idcandidats: candidatId,
      del: 0,
    },
  });
  
  if (existingCandidature) {
    throw new Error('Vous avez déjà postulé à cette aide');
  }
  
  // Vérifier le nombre maximum de bénéficiaires
  if (aide.nombreBeneficiairesActuels >= aide.nombreBeneficiairesMax) {
    throw new Error('Le nombre maximum de bénéficiaires est atteint');
  }
  
  const candidatureData = {
    aides_idaide: aideId,
    candidats_idcandidats: candidatId,
    statusCandidature: 'SOUMISE',
  };
  
  // Ajouter les fichiers
  if (files.cnib) {
    candidatureData.cnib_path = fileStorage.saveFile(files.cnib[0].buffer, files.cnib[0].originalname, 'candidatures-aide');
    candidatureData.cnib = null;
    candidatureData.cnib_filename = files.cnib[0].originalname;
    candidatureData.cnib_size = files.cnib[0].size;
  }

  if (files.demandeCandidature) {
    candidatureData.demandeCandidature_path = fileStorage.saveFile(files.demandeCandidature[0].buffer, files.demandeCandidature[0].originalname, 'candidatures-aide');
    candidatureData.demandeCandidature = null;
    candidatureData.demandeCandidature_filename = files.demandeCandidature[0].originalname;
    candidatureData.demandeCandidature_size = files.demandeCandidature[0].size;
  }

  const candidature = await CandidatureAide.create(candidatureData);
  
  // Incrémenter le compteur
  await aide.update({
    nombreBeneficiairesActuels: aide.nombreBeneficiairesActuels + 1,
  });
  
  return candidature;
};

/**
 * Obtenir les candidatures du candidat connecté
 */
const getCandidaturesByCandidat = async (candidatId) => {
  return await CandidatureAide.findAll({
    where: { 
      candidats_idcandidats: candidatId,
      del: 0,
    },
    include: [
      {
        model: Aide,
        as: 'aide',
      },
    ],
    order: [['dateCandidature', 'DESC']],
  });
};

/**
 * Obtenir une candidature par ID
 */
const getCandidatureById = async (id) => {
  const candidature = await CandidatureAide.findOne({
    where: { idcandidature: id, del: 0 },
    include: [
      {
        model: Aide,
        as: 'aide',
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
  const candidature = await CandidatureAide.findOne({
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
 * Obtenir les candidatures d'une aide
 */
const getCandidaturesByAide = async (aideId) => {
  return await CandidatureAide.findAll({
    where: { 
      aides_idaide: aideId,
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

module.exports = {
  // Aides
  createAideByCandidat,
  createAideByAdmin,
  getAllAides,
  getAidesActivesAdmin,
  getAidesByCandidat,
  getAideById,
  updateAide,
  evaluateAide,
  deleteAide,
  
  // Candidatures
  createCandidatureAide,
  getCandidaturesByCandidat,
  getCandidatureById,
  evaluateCandidature,
  getCandidaturesByAide,
};