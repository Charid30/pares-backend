// src/controllers/user.controller.js - Contrôleur de gestion des utilisateurs et agents
const userService = require('../services/user.service');
const { AgentNotificationPref, Agent, User } = require('../models');
const { success, error } = require('../utils/response.util');
const { createAgentSchema, updateAgentSchema, changePasswordSchema } = require('../validators/user.validator');
const auditService = require('../services/audit.service');

const NOTIF_TYPES = ['STAGE', 'RECRUTEMENT', 'OFFRE', 'AIDE', 'AUDIENCE'];

/**
 * Récupérer tous les rôles
 */
const getRoles = async (req, res, next) => {
  try {
    const roles = await userService.getAllRoles();
    return success(res, roles, 'Rôles récupérés avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer tous les services
 */
const getServices = async (req, res, next) => {
  try {
    const services = await userService.getAllServices();
    return success(res, services, 'Services récupérés avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer toutes les directions (pour le rattachement direct d'un agent sans service)
 */
const getDirections = async (req, res, next) => {
  try {
    const directions = await userService.getAllDirections();
    return success(res, directions, 'Directions récupérées avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer tous les agents
 */
const getAgents = async (req, res, next) => {
  try {
    const { search, role, service, direction, page, limit } = req.query;
    const agents = await userService.getAllAgents({
      search,
      role: role ? parseInt(role) : null,
      service: service ? parseInt(service) : null,
      direction: direction ? parseInt(direction) : null,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
    });
    return success(res, agents, 'Agents récupérés avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer un agent par ID
 */
const getAgentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await userService.getAgentById(parseInt(id));
    return success(res, agent, 'Agent récupéré avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Créer un nouvel agent
 */
const createAgent = async (req, res, next) => {
  try {
    const { error: validationError, value } = createAgentSchema.validate(req.body, { abortEarly: false });
    if (validationError) {
      const messages = validationError.details.map(d => d.message);
      return error(res, messages.join(', '), 400);
    }
    const createdBy = req.user?.username || 'admin';
    const agent = await userService.createAgent(value, createdBy);
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'AGENT_CREE',
      module:   'AGENT',
      entityId: agent.idagents,
      details:  { nom: agent.nom, prenom: agent.prenom, matricule: agent.matricule },
      ip: req.ip,
    });
    return success(res, agent, 'Agent créé avec succès', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * Mettre à jour un agent
 */
const updateAgent = async (req, res, next) => {
  try {
    const { error: validationError, value } = updateAgentSchema.validate(req.body, { abortEarly: false });
    if (validationError) {
      const messages = validationError.details.map(d => d.message);
      return error(res, messages.join(', '), 400);
    }
    const { id } = req.params;
    const modifiedBy = req.user?.username || 'admin';
    const agent = await userService.updateAgent(parseInt(id), value, modifiedBy);
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'AGENT_MODIFIE',
      module:   'AGENT',
      entityId: parseInt(id),
      details:  { champsModifies: Object.keys(value) },
      ip: req.ip,
    });
    return success(res, agent, 'Agent mis à jour avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * Supprimer un agent
 */
const deleteAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.username || 'admin';
    const result = await userService.deleteAgent(parseInt(id), deletedBy);
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'AGENT_SUPPRIME',
      module:   'AGENT',
      entityId: parseInt(id),
      details:  null,
      ip: req.ip,
    });
    return success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * Changer le mot de passe d'un agent
 */
const changePassword = async (req, res, next) => {
  try {
    const { error: validationError, value } = changePasswordSchema.validate(req.body, { abortEarly: false });
    if (validationError) {
      const messages = validationError.details.map(d => d.message);
      return error(res, messages.join(', '), 400);
    }
    const { id } = req.params;
    const result = await userService.changeAgentPassword(parseInt(id), value.newPassword);
    return success(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

/**
 * Statistiques des utilisateurs
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await userService.getUserStats();
    return success(res, stats, 'Statistiques récupérées avec succès');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /users/agents/me/notifications — Préférences de notification de l'agent connecté
 */
const getMyNotifications = async (req, res, next) => {
  try {
    // Trouver l'agent lié à l'utilisateur connecté
    const agent = await Agent.findOne({
      include: [{ model: User, as: 'users', where: { idusers: req.user.id }, attributes: [] }],
    });
    if (!agent) return error(res, 'Agent non trouvé', 404);

    // Récupérer ou initialiser les prefs
    const prefs = {};
    for (const type of NOTIF_TYPES) {
      const [pref] = await AgentNotificationPref.findOrCreate({
        where: { agent_idagents: agent.idagents, notificationType: type },
        defaults: { enabled: 1 },
      });
      prefs[type] = pref.enabled === 1;
    }

    return success(res, prefs, 'Préférences récupérées');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /users/agents/me/notifications — Mettre à jour les préférences
 * Body: { STAGE: true, RECRUTEMENT: false, OFFRE: true, AIDE: true, AUDIENCE: false }
 */
const updateMyNotifications = async (req, res, next) => {
  try {
    const agent = await Agent.findOne({
      include: [{ model: User, as: 'users', where: { idusers: req.user.id }, attributes: [] }],
    });
    if (!agent) return error(res, 'Agent non trouvé', 404);

    for (const type of NOTIF_TYPES) {
      if (typeof req.body[type] === 'boolean') {
        await AgentNotificationPref.upsert({
          agent_idagents: agent.idagents,
          notificationType: type,
          enabled: req.body[type] ? 1 : 0,
        });
      }
    }

    return success(res, null, 'Préférences mises à jour');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /users/agents/me/recent-events — Événements récents selon les modules du rôle connecté
 */
const getRecentEvents = async (req, res, next) => {
  try {
    const events = await userService.getRecentEvents(req.user.roleId, req.user.role);
    return success(res, events, 'Événements récents récupérés');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRoles,
  getServices,
  getDirections,
  getAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  changePassword,
  getStats,
  getMyNotifications,
  updateMyNotifications,
  getRecentEvents,
};
