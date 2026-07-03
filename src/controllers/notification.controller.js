// src/controllers/notification.controller.js
const inappService = require('../services/inapp.service');
const { success, error } = require('../utils/response.util');

// ─────────────────────────────────────────────────────────────
// Détermine le type et l'id du destinataire depuis req.user
// Un agent connecté a req.user.agentId  (non null)
// Un candidat connecté a req.user.candidatId (non null)
// ─────────────────────────────────────────────────────────────
const getRecipientFromUser = (user) => {
  if (user.agentId) {
    return { recipientType: 'AGENT', recipientId: user.agentId };
  }
  if (user.candidatId) {
    return { recipientType: 'CANDIDAT', recipientId: user.candidatId };
  }
  return null;
};

// GET /api/notifications?page=1&limit=20
const getNotifications = async (req, res) => {
  try {
    const recipient = getRecipientFromUser(req.user);
    if (!recipient) return error(res, 'Destinataire introuvable', 400);

    const { page = 1, limit = 20 } = req.query;
    const data = await inappService.getNotifications({ ...recipient, page, limit });
    return success(res, data);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/notifications/unread-count pour les notifications non lues
const getUnreadCount = async (req, res) => {
  try {
    const recipient = getRecipientFromUser(req.user);
    if (!recipient) return error(res, 'Destinataire introuvable', 400);

    const count = await inappService.countUnread(recipient);
    return success(res, { count });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PUT /api/notifications/:id/read pour les notifications lues
const markRead = async (req, res) => {
  try {
    const recipient = getRecipientFromUser(req.user);
    if (!recipient) return error(res, 'Destinataire introuvable', 400);

    await inappService.markRead({ id: parseInt(req.params.id), ...recipient });
    return success(res, null, 'Notification marquée comme lue');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PUT /api/notifications/read-all pour tout marquer comme lues
const markAllRead = async (req, res) => {
  try {
    const recipient = getRecipientFromUser(req.user);
    if (!recipient) return error(res, 'Destinataire introuvable', 400);

    await inappService.markAllRead(recipient);
    return success(res, null, 'Toutes les notifications marquées comme lues');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getNotifications, getUnreadCount, markRead, markAllRead };