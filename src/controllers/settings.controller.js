// src/controllers/settings.controller.js
const settingsService = require('../services/settings.service');
const { success, error } = require('../utils/response.util');
const { Candidat, User, Role } = require('../models');
const { Op } = require('sequelize');
const { sendBroadcastEmail } = require('../services/email.service');

const getSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings();

    // Masquer le mot de passe SMTP dans la réponse (il reste en BD)
    // smtpPass est toujours retourné vide ; smtpPassConfigured indique si un mdp est enregistré
    const safeSettings = {
      ...settings,
      email: {
        ...settings.email,
        smtpPass: '',                                                   // Ne jamais exposer le vrai mdp
        smtpPassConfigured: !!(settings.email?.smtpPass),              // Indicateur booléen côté UI
      },
    };

    return success(res, safeSettings, 'Paramètres récupérés');
  } catch (err) {
    next(err);
  }
};

const saveSettings = async (req, res, next) => {
  try {
    await settingsService.saveSettings(req.body, req.user.username);
    return success(res, null, 'Paramètres sauvegardés avec succès');
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return error(res, 'Tous les champs sont requis', 400);
    }
    if (newPassword !== confirmPassword) {
      return error(res, 'Les mots de passe ne correspondent pas', 400);
    }
    if (newPassword.length < 8) {
      return error(res, 'Le mot de passe doit contenir au moins 8 caractères', 400);
    }

    await settingsService.changePassword(req.user.id, currentPassword, newPassword);
    return success(res, null, 'Mot de passe modifié avec succès');
  } catch (err) {
    if (err.message === 'Mot de passe actuel incorrect') {
      return error(res, err.message, 400);
    }
    next(err);
  }
};

/**
 * POST /api/admin/settings/notify
 * Envoie un email groupé (broadcast) à tous les candidats ou tous les utilisateurs
 */
const broadcastNotification = async (req, res, next) => {
  try {
    const { cible, sujet, message } = req.body;

    if (!sujet?.trim() || !message?.trim()) {
      return error(res, 'Le sujet et le message sont obligatoires', 400);
    }

    let destinataires = [];

    if (cible === 'candidats' || cible === 'tous') {
      const candidats = await Candidat.findAll({
        where: { del: 0 },
        attributes: ['nom', 'prenom', 'email'],
      });
      destinataires.push(...candidats.map(c => ({ prenom: c.prenom, email: c.email })));
    }

    // Dédoublonner par email
    const uniques = [...new Map(destinataires.map(d => [d.email, d])).values()];

    if (uniques.length === 0) {
      return error(res, 'Aucun destinataire trouvé', 404);
    }

    // ── Répondre IMMÉDIATEMENT — l'envoi se fait en arrière-plan ──────────
    // Evite le timeout navigateur (ERR_NETWORK_IO_SUSPENDED) sur les listes longues
    success(res, { total: uniques.length, sent: 0, failed: 0, status: 'en_cours' },
      `Envoi démarré pour ${uniques.length} destinataire(s) — les emails sont en cours d'envoi.`
    );

    // ── Envoi asynchrone en arrière-plan (sans bloquer la réponse) ─────────
    const BATCH = 5; // lots de 5 pour ne pas saturer le SMTP
    let sent = 0;
    let failed = 0;

    (async () => {
      for (let i = 0; i < uniques.length; i += BATCH) {
        const batch = uniques.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(d =>
            sendBroadcastEmail({ to: d.email, prenom: d.prenom, sujet, message })
              .then(() => { sent++; })
              .catch((e) => {
                failed++;
                console.error(`❌ Échec envoi à ${d.email}:`, e.message);
              })
          )
        );
        // Petite pause entre les lots pour ne pas surcharger le SMTP
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      console.log(`📧 Broadcast terminé : ${sent}/${uniques.length} envoyés, ${failed} échecs`);
    })();

  } catch (err) {
    next(err);
  }
};

const getAgentsForRoutage = async (req, res, next) => {
  try {
    const agents = await settingsService.getAgentsForRoutage();
    return success(res, agents, 'Agents récupérés');
  } catch (err) {
    next(err);
  }
};

module.exports = { getSettings, saveSettings, changePassword, broadcastNotification, getAgentsForRoutage };
