// src/middlewares/auth.middleware.js
const { verifyToken } = require('../utils/jwt.util');
const { error } = require('../utils/response.util');
const { Permission } = require('../models');
const { isBlacklisted } = require('../utils/tokenBlacklist');

// Seul ADMIN bypass la vérification de permissions (accès total)
// Tous les autres rôles (y compris rôles personnalisés) passent par la table permissions
const SYSTEM_AGENT_ROLES = ['ADMIN'];

/**
 * Retourne la liste des acronymes de rôle de l'utilisateur (multi-rôles).
 * Rétro-compatible : retombe sur [role] si le tableau n'est pas présent.
 */
const userRoles = (req) =>
  (Array.isArray(req.user?.roles) && req.user.roles.length)
    ? req.user.roles
    : (req.user?.role ? [req.user.role] : []);

/**
 * Retourne la liste des ids de rôle de l'utilisateur (multi-rôles).
 * Rétro-compatible : retombe sur [roleId] si le tableau n'est pas présent.
 */
const userRoleIds = (req) =>
  (Array.isArray(req.user?.roleIds) && req.user.roleIds.length)
    ? req.user.roleIds
    : (req.user?.roleId ? [req.user.roleId] : []);

/** L'utilisateur possède-t-il au moins un rôle système (ADMIN) ? */
const hasSystemRole = (req) => userRoles(req).some(r => SYSTEM_AGENT_ROLES.includes(r));

/**
 * Extrait le token JWT depuis le cookie HttpOnly en priorité,
 * puis depuis le header Authorization (Bearer) en fallback.
 */
const extractToken = (req) => {
  // 1) Cookie HttpOnly (prioritaire — non lisible par JS)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(';').find(c => c.trim().startsWith('token='));
    if (match) {
      const value = match.split('=').slice(1).join('=').trim();
      if (value) return decodeURIComponent(value);
    }
  }
  // 2) Header Authorization Bearer (fallback — clients API / Postman)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

/**
 * Middleware d'authentification JWT
 * Vérifie la présence et la validité du token (cookie ou Bearer header)
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return error(res, 'Token manquant ou invalide', 401);
    }

    // Vérifier si le token a été blacklisté (déconnexion explicite)
    if (await isBlacklisted(token)) {
      return error(res, 'Token invalide ou expiré', 401);
    }

    // Vérifier le token
    const decoded = verifyToken(token);

    if (!decoded) {
      return error(res, 'Token invalide ou expiré', 401);
    }

    // Attacher le token à la requête (utile pour le logout)
    req.token = token;

    // Normaliser les rôles multiples (rétro-compat avec anciens tokens à rôle unique)
    const roles = Array.isArray(decoded.roles) && decoded.roles.length
      ? decoded.roles
      : (decoded.role ? [decoded.role] : []);
    const roleIds = Array.isArray(decoded.roleIds) && decoded.roleIds.length
      ? decoded.roleIds
      : (decoded.roleId ? [decoded.roleId] : []);

    // Ajouter les informations de l'utilisateur à la requête
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,            // rôle principal (rétro-compat)
      roleId: decoded.roleId || null, // id principal (rétro-compat)
      roles,                         // tous les acronymes
      roleIds,                       // tous les ids
      candidatId: decoded.candidatId || null,
      agentId: decoded.agentId || null,
    };

    next();
  } catch (err) {
    return error(res, 'Erreur d\'authentification', 401);
  }
};

/**
 * Middleware de vérification des rôles
 * @param {Array} allowedRoles - Liste des rôles autorisés
 * Supporte: authorize('ADMIN', 'USER') ou authorize(['ADMIN', 'USER'])
 */
const authorize = (allowedRoles) => {
  // Si c'est un tableau, l'utiliser directement, sinon créer un tableau
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Non authentifié', 401);
    }

    // L'utilisateur passe s'il possède AU MOINS UN des rôles autorisés
    const intersection = userRoles(req).some(r => roles.includes(r));
    if (!intersection) {
      return error(
        res,
        'Accès refusé : permissions insuffisantes',
        403
      );
    }

    next();
  };
};

/**
 * Middleware de vérification par module (pour les agents à rôle personnalisé)
 * - ADMIN → accès direct sans vérification DB
 * - Rôle personnalisé → vérifie la table `permissions` en base de données
 * @param {string} module - Clé du module (ex: 'DEMANDE_AUDIENCE', 'STAGE', ...)
 */
const authorizeModule = (module) => async (req, res, next) => {
  if (!req.user) return error(res, 'Non authentifié', 401);

  // Rôle système (ADMIN) présent → accès direct sans vérification DB
  if (hasSystemRole(req)) return next();

  // Rôles personnalisés → vérifier les permissions en base (union des rôles)
  const roleIds = userRoleIds(req);
  if (!roleIds.length) return error(res, 'Accès refusé : rôle non reconnu', 403);

  try {
    const { Op } = require('sequelize');
    const perm = await Permission.findOne({
      where: { role_idrole: { [Op.in]: roleIds }, module, del: 0 },
    });
    if (!perm) return error(res, 'Accès refusé : permissions insuffisantes', 403);
    next();
  } catch (err) {
    return error(res, 'Erreur serveur lors de la vérification des permissions', 500);
  }
};

/**
 * Middleware de vérification d'une action spécifique sur un module
 * - Rôles système (ADMIN, ...) → accès direct
 * - Rôle personnalisé → vérifie la table `permissions` pour module + action précise
 * @param {string} module - Clé du module (ex: 'CANDIDATS', 'STAGE', ...)
 * @param {string} action - Action spécifique (CREER, MODIFIER, VALIDER, REJETER, SUPPRIMER)
 */
const authorizeAction = (module, action) => async (req, res, next) => {
  if (!req.user) return error(res, 'Non authentifié', 401);

  // Rôle système (ADMIN) présent → accès direct sans vérification DB
  if (hasSystemRole(req)) return next();

  // Rôles personnalisés → vérifier la permission spécifique (union des rôles)
  const roleIds = userRoleIds(req);
  if (!roleIds.length) return error(res, 'Accès refusé : rôle non reconnu', 403);

  try {
    const { Op } = require('sequelize');
    const perm = await Permission.findOne({
      where: { role_idrole: { [Op.in]: roleIds }, module, action, del: 0 },
    });
    if (!perm) return error(res, `Accès refusé : permission '${action}' manquante sur le module '${module}'`, 403);
    next();
  } catch (err) {
    return error(res, 'Erreur serveur lors de la vérification des permissions', 500);
  }
};

/**
 * Middleware de vérification : l'utilisateur doit avoir AU MOINS UNE des actions listées sur le module
 * Utile pour les routes qui gèrent à la fois VALIDER et REJETER (ex: PUT /:id/statut)
 * @param {string} module  - Clé du module (ex: 'STAGE')
 * @param {string[]} actions - Tableau d'actions acceptées (ex: ['VALIDER', 'REJETER'])
 */
const authorizeAnyAction = (module, actions) => async (req, res, next) => {
  if (!req.user) return error(res, 'Non authentifié', 401);

  // Rôle système (ADMIN) présent → accès direct
  if (hasSystemRole(req)) return next();

  const roleIds = userRoleIds(req);
  if (!roleIds.length) return error(res, 'Accès refusé : rôle non reconnu', 403);

  try {
    const { Op } = require('sequelize');
    const perm = await Permission.findOne({
      where: { role_idrole: { [Op.in]: roleIds }, module, action: { [Op.in]: actions }, del: 0 },
    });
    if (!perm) return error(res, `Accès refusé : aucune des permissions requises (${actions.join(', ')}) sur '${module}'`, 403);
    next();
  } catch (err) {
    return error(res, 'Erreur serveur lors de la vérification des permissions', 500);
  }
};

module.exports = { authenticate, authorize, authorizeModule, authorizeAction, authorizeAnyAction };