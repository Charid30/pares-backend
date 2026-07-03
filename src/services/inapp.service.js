// src/services/inapp.service.js
// Gestion des notifications in-app (cloche + pastille)
// Appelé en parallèle de l'envoi email — jamais bloquant

const { Notification } = require('../models');

// ─────────────────────────────────────────────────────────────
// Créer une notification (non bloquant — try/catch interne)
// ─────────────────────────────────────────────────────────────
const push = async ({ recipientType, recipientId, type, titre, message, link = null }) => {
  try {
    await Notification.create({
      recipient_type: recipientType,
      recipient_id: recipientId,
      type,
      titre,
      message,
      link,
      read: 0,
    });
  } catch (err) {
    console.error('[InApp] Erreur création notification:', err.message);
    // Ne jamais propager — une notif ratée ne doit pas planter le métier
  }
};

// Pousser la même notification vers tous les agents actifs d'un rôle/service
// (utilisé pour notifier tous les agents qui ont activé un type de notif)
const pushToAgents = async ({ agentIds, type, titre, message, link = null }) => {
  if (!agentIds || agentIds.length === 0) return;
  for (const id of agentIds) {
    await push({ recipientType: 'AGENT', recipientId: id, type, titre, message, link });
  }
};

// ─────────────────────────────────────────────────────────────
// Lire les notifications d'un destinataire (paginées)
// ─────────────────────────────────────────────────────────────
const getNotifications = async ({ recipientType, recipientId, page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const { count, rows } = await Notification.findAndCountAll({
    where: { recipient_type: recipientType, recipient_id: recipientId },
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
  return { total: count, page: parseInt(page), limit: parseInt(limit), items: rows };
};

// ─────────────────────────────────────────────────────────────
// Compter les non-lues
// ─────────────────────────────────────────────────────────────
const countUnread = async ({ recipientType, recipientId }) => {
  return Notification.count({
    where: { recipient_type: recipientType, recipient_id: recipientId, read: 0 },
  });
};

// ─────────────────────────────────────────────────────────────
// Marquer une notification comme lue
// ─────────────────────────────────────────────────────────────
const markRead = async ({ id, recipientType, recipientId }) => {
  return Notification.update(
    { read: 1 },
    { where: { id, recipient_type: recipientType, recipient_id: recipientId } }
  );
};

// ─────────────────────────────────────────────────────────────
// Tout marquer comme lu
// ─────────────────────────────────────────────────────────────
const markAllRead = async ({ recipientType, recipientId }) => {
  return Notification.update(
    { read: 1 },
    { where: { recipient_type: recipientType, recipient_id: recipientId, read: 0 } }
  );
};

module.exports = { push, pushToAgents, getNotifications, countUnread, markRead, markAllRead };