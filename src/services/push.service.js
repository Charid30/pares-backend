// src/services/push.service.js
// Notifications push navigateur (Web Push API), via des clés VAPID.
// Chaque envoi in-app (inapp.service.js) déclenche aussi un push si l'utilisateur
// a au moins un abonnement actif.
const webpush = require('web-push');
const { PushSubscription } = require('../models');

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT      || 'mailto:portailsonabhy@gmail.com';

const isConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('⚠️  VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY non définies — notifications push désactivées');
}

/**
 * Enregistrer (ou mettre à jour) un abonnement push pour un utilisateur.
 */
const saveSubscription = async ({ recipientType, recipientId, subscription, userAgent }) => {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Abonnement push invalide');
  }

  const [row] = await PushSubscription.findOrCreate({
    where: { endpoint },
    defaults: {
      recipient_type: recipientType,
      recipient_id: recipientId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    },
  });

  // Réabonnement (même endpoint, ex. changement d'utilisateur sur le même appareil)
  await row.update({
    recipient_type: recipientType,
    recipient_id: recipientId,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent || row.userAgent,
  });

  return row;
};

/**
 * Supprimer un abonnement (désactivation depuis le navigateur).
 */
const removeSubscription = async (endpoint) => {
  if (!endpoint) return;
  await PushSubscription.destroy({ where: { endpoint } });
};

/**
 * Envoyer une notification push à tous les abonnements d'un utilisateur.
 * Nettoie automatiquement les abonnements expirés/invalides (410/404).
 * Jamais bloquant : les erreurs sont capturées, jamais propagées.
 */
const sendPushToUser = async ({ recipientType, recipientId, titre, message, link = null }) => {
  if (!isConfigured) return;

  try {
    const subscriptions = await PushSubscription.findAll({
      where: { recipient_type: recipientType, recipient_id: recipientId },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title: titre, body: message, link });

    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        // 404/410 = abonnement expiré ou révoqué côté navigateur → nettoyer
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sub.destroy().catch(() => {});
        } else {
          console.error('[Push] Erreur envoi:', err.message);
        }
      }
    }));
  } catch (err) {
    console.error('[Push] Erreur sendPushToUser:', err.message);
  }
};

module.exports = { isConfigured, VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendPushToUser };
