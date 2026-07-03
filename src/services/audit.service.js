// src/services/audit.service.js
const { AuditLog } = require('../models');
const { Op } = require('sequelize');

/**
 * Enregistre une entrée dans le journal d'audit.
 * Ne lance jamais d'exception — les erreurs d'audit ne doivent pas bloquer l'action métier.
 *
 * @param {object} params
 * @param {number|null} params.agentId      - ID de l'agent qui agit (null si système)
 * @param {string|null} params.agentNom     - Nom complet de l'agent (snapshot)
 * @param {string}      params.action       - Ex: STAGE_ACCEPTE, AGENT_CREE
 * @param {string}      params.module       - Ex: STAGE, AGENT, OFFRE
 * @param {number|null} params.entityId     - ID de l'entité affectée
 * @param {object|null} params.details      - Infos contextuelles (motif, dates, etc.)
 * @param {string|null} params.ip           - Adresse IP de la requête
 */
const log = async ({ agentId = null, agentNom = null, action, module, entityId = null, details = null, ip = null }) => {
  try {
    await AuditLog.create({
      agent_id:   agentId,
      agent_nom:  agentNom,
      action,
      module,
      entity_id:  entityId,
      details,
      ip_address: ip,
    });
  } catch (err) {
    // Ne jamais faire crasher l'appel métier à cause du log
    console.error('[AuditLog] Erreur enregistrement:', err.message);
  }
};

/**
 * Récupère les logs d'audit avec pagination et filtres.
 *
 * @param {object} filters
 * @param {string}  filters.module    - Filtrer par module
 * @param {string}  filters.action    - Filtrer par action
 * @param {number}  filters.agentId   - Filtrer par agent
 * @param {string}  filters.search    - Recherche sur agent_nom
 * @param {string}  filters.dateDebut - Date ISO de début
 * @param {string}  filters.dateFin   - Date ISO de fin
 * @param {number}  filters.page
 * @param {number}  filters.limit
 */
const getAuditLogs = async (filters = {}) => {
  const {
    module: mod,
    action,
    agentId,
    search,
    agentNom,   // alias frontend
    dateDebut,
    dateFin,
    page = 1,
    limit = 20,
  } = filters;

  const where = {};

  if (mod)      where.module   = mod;
  if (action)   where.action   = action;
  if (agentId)  where.agent_id = agentId;
  const searchTerm = search || agentNom;
  if (searchTerm) where.agent_nom = { [Op.like]: `%${searchTerm}%` };

  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
    if (dateFin) {
      const fin = new Date(dateFin);
      fin.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = fin;
    }
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit:  parseInt(limit),
    offset,
  });

  return {
    items:      rows,
    total:      count,
    page:       parseInt(page),
    totalPages: Math.ceil(count / parseInt(limit)),
  };
};

/**
 * Liste des modules présents dans la base (valeurs distinctes).
 */
const getModules = async () => {
  const rows = await AuditLog.findAll({
    attributes: ['module'],
    group: ['module'],
    raw: true,
  });
  return rows.map(r => r.module).filter(Boolean).sort();
};

/**
 * Liste des actions présentes dans la base (valeurs distinctes).
 */
const getActions = async () => {
  const rows = await AuditLog.findAll({
    attributes: ['action'],
    group: ['action'],
    raw: true,
  });
  return rows.map(r => r.action).filter(Boolean).sort();
};

module.exports = { log, getAuditLogs, getModules, getActions };
