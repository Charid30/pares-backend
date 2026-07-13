// src/controllers/apiKey.controller.js
// Gestion admin des clés API (applications externes).
// La clé en clair n'est retournée QU'UNE SEULE FOIS, à la création (ou régénération).
const crypto = require('crypto');
const { ApiKey } = require('../models');
const { success, error } = require('../utils/response.util');
const auditService = require('../services/audit.service');

const SCOPES = ['LECTURE', 'ECRITURE', 'LECTURE_ECRITURE'];

const KEY_PREFIX = 'portail_snbh_';

// Génère une clé au format portail_snbh_<64 hex>, retourne { rawKey, keyHash, keyPrefix }
const generateKey = () => {
  const rawKey = `${KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 8); // préfixe + 8 premiers hex — pour identification UI
  return { rawKey, keyHash, keyPrefix };
};

// Champs exposés à l'UI (jamais le hash)
const toPublic = (k) => ({
  idapikey: k.idapikey,
  nomApplication: k.nomApplication,
  description: k.description,
  keyPrefix: k.keyPrefix,
  scope: k.scope,
  actif: k.actif,
  expiresAt: k.expiresAt,
  lastUsedAt: k.lastUsedAt,
  createdBy: k.createdBy,
  createdAt: k.createdAt,
});

/**
 * Lister toutes les clés API
 * GET /api/admin/api-keys
 */
const getAllKeys = async (req, res) => {
  try {
    const keys = await ApiKey.findAll({
      where: { del: 0 },
      order: [['createdAt', 'DESC']],
    });
    return success(res, keys.map(toPublic), 'Clés API récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Créer une clé API
 * POST /api/admin/api-keys
 * Body: { nomApplication, description?, scope, expiresAt? }
 */
const createKey = async (req, res) => {
  try {
    const { nomApplication, description, scope, expiresAt } = req.body;

    if (!nomApplication || !nomApplication.trim()) {
      return error(res, 'Le nom de l\'application est obligatoire', 400);
    }
    if (!SCOPES.includes(scope)) {
      return error(res, `Scope invalide (attendu : ${SCOPES.join(', ')})`, 400);
    }

    const { rawKey, keyHash, keyPrefix } = generateKey();

    const apiKey = await ApiKey.create({
      nomApplication: nomApplication.trim(),
      description: description?.trim() || null,
      keyHash,
      keyPrefix,
      scope,
      actif: true,
      expiresAt: expiresAt || null,
      createdBy: req.user?.username || null,
    });

    await auditService.log({
      agentId:  req.user?.agentId || null,
      agentNom: req.user?.username || null,
      action:   'API_KEY_CREEE',
      module:   'SECURITE',
      entityId: apiKey.idapikey,
      details:  { nomApplication: apiKey.nomApplication, scope, keyPrefix },
      ip:       req.ip,
    });

    // rawKey retournée UNE SEULE FOIS — elle n'est plus jamais récupérable ensuite
    return success(res, { ...toPublic(apiKey), rawKey }, 'Clé API créée — copiez-la maintenant, elle ne sera plus affichée', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Modifier une clé API (nom, description, scope, actif, expiration)
 * PUT /api/admin/api-keys/:id
 */
const updateKey = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ where: { idapikey: req.params.id, del: 0 } });
    if (!apiKey) return error(res, 'Clé API introuvable', 404);

    const { nomApplication, description, scope, actif, expiresAt } = req.body;

    if (scope !== undefined && !SCOPES.includes(scope)) {
      return error(res, `Scope invalide (attendu : ${SCOPES.join(', ')})`, 400);
    }

    await apiKey.update({
      ...(nomApplication !== undefined ? { nomApplication: nomApplication.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(scope !== undefined ? { scope } : {}),
      ...(actif !== undefined ? { actif: !!actif } : {}),
      ...(expiresAt !== undefined ? { expiresAt: expiresAt || null } : {}),
    });

    await auditService.log({
      agentId:  req.user?.agentId || null,
      agentNom: req.user?.username || null,
      action:   'API_KEY_MODIFIEE',
      module:   'SECURITE',
      entityId: apiKey.idapikey,
      details:  { nomApplication: apiKey.nomApplication, scope: apiKey.scope, actif: apiKey.actif },
      ip:       req.ip,
    });

    return success(res, toPublic(apiKey), 'Clé API mise à jour');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Régénérer la valeur d'une clé existante (l'ancienne cesse immédiatement de fonctionner)
 * POST /api/admin/api-keys/:id/regenerer
 */
const regenerateKey = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ where: { idapikey: req.params.id, del: 0 } });
    if (!apiKey) return error(res, 'Clé API introuvable', 404);

    const { rawKey, keyHash, keyPrefix } = generateKey();
    await apiKey.update({ keyHash, keyPrefix });

    await auditService.log({
      agentId:  req.user?.agentId || null,
      agentNom: req.user?.username || null,
      action:   'API_KEY_REGENEREE',
      module:   'SECURITE',
      entityId: apiKey.idapikey,
      details:  { nomApplication: apiKey.nomApplication, keyPrefix },
      ip:       req.ip,
    });

    return success(res, { ...toPublic(apiKey), rawKey }, 'Clé régénérée — copiez-la maintenant, elle ne sera plus affichée');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Révoquer (supprimer) une clé API
 * DELETE /api/admin/api-keys/:id
 */
const deleteKey = async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ where: { idapikey: req.params.id, del: 0 } });
    if (!apiKey) return error(res, 'Clé API introuvable', 404);

    await apiKey.update({ del: 1, actif: false });

    await auditService.log({
      agentId:  req.user?.agentId || null,
      agentNom: req.user?.username || null,
      action:   'API_KEY_REVOQUEE',
      module:   'SECURITE',
      entityId: apiKey.idapikey,
      details:  { nomApplication: apiKey.nomApplication, keyPrefix: apiKey.keyPrefix },
      ip:       req.ip,
    });

    return success(res, null, 'Clé API révoquée');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = { getAllKeys, createKey, updateKey, regenerateKey, deleteKey };
