// src/controllers/external.controller.js
// API externe (v1) — endpoints consommés par des applications tierces authentifiées
// par clé API (voir apiKey.middleware). Ne retourne JAMAIS de blobs ni de données
// sensibles (mots de passe, fichiers, CNIB...).
const { Stage, Offre, Aide, DemandeAudience, Candidat } = require('../models');
const { success, error } = require('../utils/response.util');

// Pagination simple commune à tous les endpoints
const getPagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  return { page, limit, offset: (page - 1) * limit };
};

const candidatInclude = {
  model: Candidat,
  as: 'candidat',
  attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
};

/**
 * GET /api/external/v1/stages
 * Filtres : ?statusStage=EN_ATTENTE&page=1&limit=25
 */
const getStages = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const where = { del: 0 };
    if (req.query.statusStage) where.statusStage = req.query.statusStage;

    const { count, rows } = await Stage.findAndCountAll({
      where,
      include: [candidatInclude],
      attributes: [
        'idstage', 'typeStage', 'typeEtablissement', 'niveau', 'domaineStage',
        'dureeStage', 'dateDebutSouhaitee', 'dateDebutEffective', 'dateFinEffective',
        'statusStage', 'estRenouvellement', 'createdDate',
      ],
      order: [['createdDate', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return success(res, {
      items: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    }, 'Stages récupérés');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/external/v1/offres
 */
const getOffres = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const where = { del: 0 };
    if (req.query.statusOffre) where.statusOffre = req.query.statusOffre;

    const { count, rows } = await Offre.findAndCountAll({
      where,
      include: [{ ...candidatInclude, as: 'candidatCreateur' }],
      attributes: ['idoffres', 'typeOffre', 'titre', 'description', 'statusOffre', 'createdDate'],
      order: [['createdDate', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return success(res, {
      items: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    }, 'Offres récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/external/v1/aides
 */
const getAides = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const where = { del: 0 };
    if (req.query.statusAide) where.statusAide = req.query.statusAide;

    const { count, rows } = await Aide.findAndCountAll({
      where,
      include: [{ ...candidatInclude, as: 'candidatCreateur' }],
      attributes: ['idaide', 'typeAide', 'titre', 'description', 'statusAide', 'createdDate'],
      order: [['createdDate', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return success(res, {
      items: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    }, 'Aides récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/external/v1/audiences
 */
const getAudiences = async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req);
    const where = { del: 0 };
    if (req.query.status) where.status = req.query.status;

    const { count, rows } = await DemandeAudience.findAndCountAll({
      where,
      include: [candidatInclude],
      attributes: [
        'iddemande', 'modeSoumission', 'pourM', 'motif',
        'dateAudience', 'heureAudience', 'status', 'createdDate',
      ],
      order: [['createdDate', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return success(res, {
      items: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    }, 'Audiences récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/external/v1/stats
 * Compteurs globaux par module — utile pour des tableaux de bord externes.
 */
const getStats = async (req, res) => {
  try {
    const [stages, offres, aides, audiences] = await Promise.all([
      Stage.count({ where: { del: 0 } }),
      Offre.count({ where: { del: 0 } }),
      Aide.count({ where: { del: 0 } }),
      DemandeAudience.count({ where: { del: 0 } }),
    ]);
    return success(res, { stages, offres, aides, audiences }, 'Statistiques récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getStages, getOffres, getAides, getAudiences, getStats };
