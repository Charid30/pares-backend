// src/controllers/push.controller.js
const pushService = require('../services/push.service');
const { success, error } = require('../utils/response.util');

// Détermine le type et l'id du destinataire depuis req.user (même logique
// que notification.controller.js — un agent a agentId, un candidat a candidatId)
const getRecipientFromUser = (user) => {
  if (user.agentId) return { recipientType: 'AGENT', recipientId: user.agentId };
  if (user.candidatId) return { recipientType: 'CANDIDAT', recipientId: user.candidatId };
  return null;
};

// GET /api/push/vapid-public-key
const getVapidPublicKey = async (req, res) => {
  return success(res, { publicKey: pushService.VAPID_PUBLIC_KEY, enabled: pushService.isConfigured });
};

// POST /api/push/subscribe
const subscribe = async (req, res) => {
  try {
    const recipient = getRecipientFromUser(req.user);
    if (!recipient) return error(res, 'Destinataire introuvable', 400);

    await pushService.saveSubscription({
      ...recipient,
      subscription: req.body.subscription,
      userAgent: req.headers['user-agent'],
    });
    return success(res, null, 'Abonnement enregistré');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// POST /api/push/unsubscribe
const unsubscribe = async (req, res) => {
  try {
    await pushService.removeSubscription(req.body.endpoint);
    return success(res, null, 'Abonnement supprimé');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = { getVapidPublicKey, subscribe, unsubscribe };
