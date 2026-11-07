// src/controllers/diffusion.controller.js
// Notifications push envoyées volontairement par l'admin (route /api/admin/notifications-diffusion, ADMIN seul).
const diffusionService = require('../services/diffusion.service');
const auditService = require('../services/audit.service');
const { success, error } = require('../utils/response.util');

const auteurDe = (req) => ({ agentId: req.user?.agentId ?? null, nom: req.user?.username || 'Administrateur' });

/** POST /apercu : nombre de candidats, d'agents et d'appareils touchés, avant de confirmer l'envoi. */
const apercu = async (req, res) => {
  try {
    return success(res, await diffusionService.apercu(req.body));
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/** POST / : envoyer (cloche tout de suite, push en arrière-plan). */
const envoyer = async (req, res) => {
  try {
    const { diffusion } = await diffusionService.envoyer(req.body, auteurDe(req));
    await auditService.log({
      agentId: req.user?.agentId ?? null,
      agentNom: req.user?.username,
      action: 'NOTIFICATION_DIFFUSEE',
      module: 'NOTIFICATION',
      entityId: diffusion.id,
      details: {
        objet: `Notification « ${diffusion.titre} »`,
        cible: diffusion.cible,
        directions: diffusion.directions,
        destinataires: diffusion.nbDestinataires,
        appareils: diffusion.nbAppareils,
      },
      ip: req.ip,
    });
    return success(res, diffusion, `Notification envoyée à ${diffusion.nbDestinataires} destinataire(s)`, 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/** GET / : historique des envois. */
const historique = async (req, res) => {
  try {
    return success(res, await diffusionService.historique());
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { apercu, envoyer, historique };
