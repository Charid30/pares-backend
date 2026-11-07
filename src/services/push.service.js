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

/**
 * Appareils abonnés au push pour une liste de destinataires (par lots, pour ne pas dépasser la taille d'un IN).
 * @param {{ recipientType: string, recipientId: number }[]} destinataires
 */
const abonnementsDe = async (destinataires) => {
  const { Op } = require('sequelize');
  const resultat = [];
  for (const type of ['CANDIDAT', 'AGENT']) {
    const ids = destinataires.filter(d => d.recipientType === type).map(d => d.recipientId);
    for (let i = 0; i < ids.length; i += 500) {
      resultat.push(...await PushSubscription.findAll({
        where: { recipient_type: type, recipient_id: { [Op.in]: ids.slice(i, i + 500) } },
      }));
    }
  }
  return resultat;
};

/**
 * Envoi d'un même push à de nombreux appareils (notification diffusée par l'admin).
 * Quelques envois à la fois ; abonnements expirés (404/410) supprimés. Jamais d'exception.
 * @param {Array} abonnements - lignes PushSubscription (abonnementsDe)
 * @param {(sub) => object} payloadDe - contenu du push pour un abonnement ({ title, body, link })
 * @returns {{ reussis: number, echecs: number }}
 */
const envoyerPushEnMasse = async (abonnements, payloadDe, parallele = 10) => {
  const bilan = { reussis: 0, echecs: 0 };
  if (!isConfigured) return bilan;
  for (let i = 0; i < abonnements.length; i += parallele) {
    await Promise.all(abonnements.slice(i, i + parallele).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payloadDe(sub)),
        );
        bilan.reussis += 1;
      } catch (err) {
        bilan.echecs += 1;
        if (err.statusCode === 404 || err.statusCode === 410) await sub.destroy().catch(() => {});
        else console.error('[Push] Erreur envoi groupé:', err.message);
      }
    }));
  }
  return bilan;
};

module.exports = {
  isConfigured, VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendPushToUser, abonnementsDe, envoyerPushEnMasse,
};
