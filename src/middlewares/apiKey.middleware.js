// src/middlewares/apiKey.middleware.js
// Authentification des applications externes par clé API (header X-API-Key).
// La clé reçue est hashée en SHA-256 et comparée au hash stocké — la clé en
// clair n'existe nulle part en base.
const crypto = require('crypto');
const { ApiKey } = require('../models');
const { error } = require('../utils/response.util');

/**
 * Vérifie la clé API envoyée dans le header X-API-Key.
 * Attache l'entrée trouvée à req.apiClient pour les middlewares suivants.
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const rawKey = req.headers['x-api-key'];
    if (!rawKey) {
      return error(res, 'Clé API manquante (header X-API-Key requis)', 401);
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await ApiKey.findOne({ where: { keyHash, del: 0 } });

    if (!apiKey) {
      return error(res, 'Clé API invalide', 401);
    }
    if (!apiKey.actif) {
      return error(res, 'Clé API désactivée', 403);
    }
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return error(res, 'Clé API expirée', 401);
    }

    req.apiClient = apiKey;

    // Trace de dernière utilisation — sans bloquer la requête
    apiKey.update({ lastUsedAt: new Date() }).catch(() => {});

    next();
  } catch (err) {
    return error(res, 'Erreur d\'authentification API', 500);
  }
};

/**
 * Vérifie que le scope de la clé autorise la méthode HTTP :
 * GET/HEAD → LECTURE requise, POST/PUT/PATCH/DELETE → ECRITURE requise.
 * LECTURE_ECRITURE autorise tout.
 */
const checkScope = (req, res, next) => {
  const isRead = ['GET', 'HEAD'].includes(req.method);
  const required = isRead ? 'LECTURE' : 'ECRITURE';
  const scope = req.apiClient?.scope;

  if (scope === 'LECTURE_ECRITURE' || scope === required) {
    return next();
  }
  return error(
    res,
    `Cette clé API ne dispose pas du droit ${required === 'LECTURE' ? 'de lecture' : 'd\'écriture'} (scope actuel : ${scope})`,
    403
  );
};

module.exports = { authenticateApiKey, checkScope };
